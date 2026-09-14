import { getSupabaseUser, supabase } from './aviationIntercept/SupabaseClient.js';

const TABLE_NAME = 'player_settings';
const DEFAULT_SETTINGS = {
  autoSaveEnabled: true,
  autoSaveIntervalMinutes: 5
};

async function requireUser() {
  if (!supabase) {
    return { error: { message: 'Supabase not configured.' } };
  }

  const user = await getSupabaseUser();
  if (!user) {
    return { error: { message: 'User not logged in.' } };
  }

  return { user };
}

function normalizeSettings(row) {
  return {
    autoSaveEnabled: row?.auto_save_enabled ?? DEFAULT_SETTINGS.autoSaveEnabled,
    autoSaveIntervalMinutes: row?.auto_save_interval_minutes ?? DEFAULT_SETTINGS.autoSaveIntervalMinutes,
    updatedAt: row?.updated_at ?? null
  };
}

export const playerSettingsService = {
  defaults: DEFAULT_SETTINGS,

  async getPlayerSettings() {
    const auth = await requireUser();
    if (auth.error) {
      return {
        data: { ...DEFAULT_SETTINGS, updatedAt: null },
        error: auth.error
      };
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) {
      return {
        data: { ...DEFAULT_SETTINGS, updatedAt: null },
        error
      };
    }

    return {
      data: normalizeSettings(data),
      error: null
    };
  },

  async updatePlayerSettings(patch) {
    const auth = await requireUser();
    if (auth.error) {
      return { data: null, error: auth.error };
    }

    const payload = {
      user_id: auth.user.id,
      auto_save_enabled: patch.autoSaveEnabled,
      auto_save_interval_minutes: patch.autoSaveIntervalMinutes,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .maybeSingle();

    return {
      data: data ? normalizeSettings(data) : null,
      error: error ?? null
    };
  }
};

export default playerSettingsService;
