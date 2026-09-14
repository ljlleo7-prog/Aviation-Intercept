import { getSupabaseUser, supabase } from './aviationIntercept/SupabaseClient.js';

const TABLE_NAME = 'flight_saves';

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

export const cloudSaveService = {
  async getCurrentUserSave() {
    const auth = await requireUser();
    if (auth.error) return { data: null, error: auth.error };

    const { user } = auth;
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { data: data ?? null, error: error ?? null };
  },

  async saveFlight(payload, options = {}) {
    const auth = await requireUser();
    if (auth.error) return { data: null, error: auth.error };

    if (!payload || typeof payload !== 'object' || !payload.version) {
      return { data: null, error: { message: 'Invalid flight save payload.' } };
    }

    const { user } = auth;
    const saveType = options.saveType || 'manual';

    const { data: existing, error: fetchError } = await supabase
      .from(TABLE_NAME)
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return { data: null, error: fetchError };
    }

    if (existing?.id) {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update({
          data: payload,
          save_type: saveType,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
        .select()
        .maybeSingle();

      return { data: data ?? null, error: error ?? null };
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert({
        user_id: user.id,
        data: payload,
        status: 'active',
        save_type: saveType
      })
      .select()
      .maybeSingle();

    return { data: data ?? null, error: error ?? null };
  },

  async discardFlight(saveId) {
    const auth = await requireUser();
    if (auth.error) return { data: null, error: auth.error };

    let query = supabase
      .from(TABLE_NAME)
      .update({
        status: 'discarded',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', auth.user.id)
      .eq('status', 'active');

    if (saveId) {
      query = query.eq('id', saveId);
    }

    const { data, error } = await query.select();
    return { data: data ?? null, error: error ?? null };
  }
};

export default cloudSaveService;
