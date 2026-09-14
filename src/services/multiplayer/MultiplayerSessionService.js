import eventBus from '../eventBus.js';
import { getSupabaseUser, isSupabaseReady, supabase } from '../aviationIntercept/SupabaseClient.js';

function normalizeSessionPayload(payload) {
  if (!payload) {
    return null;
  }

  return {
    sessionId: payload.sessionId || payload.id || null,
    namespaceKey: payload.namespaceKey || payload.namespace || null,
    sessionCode: payload.sessionCode || payload.code || null,
    role: payload.role || 'pilot',
    isHost: Boolean(payload.isHost),
    callsign: payload.callsign || null,
    aircraftType: payload.aircraftType || null,
    scenarioConfig: payload.scenarioConfig || {}
  };
}

class MultiplayerSessionService {
  constructor() {
    this.currentSession = null;
    this.currentUser = null;
  }

  async getCurrentUser() {
    this.currentUser = await getSupabaseUser();
    return this.currentUser;
  }

  async canUseMultiplayer() {
    if (!isSupabaseReady()) {
      return { ok: false, reason: 'Supabase is not configured.' };
    }

    const user = await this.getCurrentUser();
    if (!user) {
      return { ok: false, reason: 'Supabase auth is required for multiplayer.' };
    }

    return { ok: true, user };
  }

  async createSession({ namespaceKey, sessionCode, role = 'pilot', callsign, aircraftType, scenarioConfig = {} }) {
    const gate = await this.canUseMultiplayer();
    if (!gate.ok) {
      return { data: null, error: { message: gate.reason } };
    }

    const rpcPayload = {
      namespace_key: namespaceKey,
      scenario_config: {
        ...scenarioConfig,
        session_code: sessionCode,
        callsign,
        aircraft_type: aircraftType,
        requested_role: role
      }
    };

    const { data, error } = await supabase.rpc('mp_create_session', rpcPayload);
    if (error) {
      return { data: null, error };
    }

    this.currentSession = normalizeSessionPayload({
      sessionId: data,
      namespaceKey,
      sessionCode,
      role,
      isHost: true,
      callsign,
      aircraftType,
      scenarioConfig
    });

    eventBus.publishWithMetadata(eventBus.Types.MULTIPLAYER_STATUS_CHANGED, {
      status: 'joined',
      session: this.currentSession,
      user: gate.user
    });

    return { data: this.currentSession, error: null };
  }

  async createOrJoinSession({ namespaceKey, sessionCode, role = 'pilot', callsign, aircraftType, scenarioConfig = {} }) {
    const created = await this.createSession({
      namespaceKey,
      sessionCode,
      role,
      callsign,
      aircraftType,
      scenarioConfig
    });

    if (!created.error) {
      return created;
    }

    const message = created.error?.message || '';
    if (!/duplicate key value|duplicate|unique/i.test(message)) {
      return created;
    }

    const joined = await this.joinSession({ namespaceKey, sessionCode, role });
    if (joined.data) {
      this.currentSession = {
        ...joined.data,
        callsign: joined.data.callsign || callsign || null,
        aircraftType: joined.data.aircraftType || aircraftType || null
      };
      return { data: this.currentSession, error: null };
    }

    return created;
  }

  async joinSession({ namespaceKey, sessionCode, role = 'pilot' }) {
    const gate = await this.canUseMultiplayer();
    if (!gate.ok) {
      return { data: null, error: { message: gate.reason } };
    }

    const { data, error } = await supabase.rpc('mp_join_session', {
      namespace_key: namespaceKey,
      session_code: sessionCode,
      desired_role: role
    });

    if (error) {
      return { data: null, error };
    }

    this.currentSession = normalizeSessionPayload(data);
    eventBus.publishWithMetadata(eventBus.Types.MULTIPLAYER_STATUS_CHANGED, {
      status: 'joined',
      session: this.currentSession,
      user: gate.user
    });

    return { data: this.currentSession, error: null };
  }

  async leaveCurrentSession() {
    if (!this.currentSession?.sessionId || !supabase) {
      this.currentSession = null;
      return { error: null };
    }

    const { error } = await supabase.rpc('mp_leave_session', {
      target_session_id: this.currentSession.sessionId
    });

    const previous = this.currentSession;
    this.currentSession = null;

    eventBus.publishWithMetadata(eventBus.Types.MULTIPLAYER_STATUS_CHANGED, {
      status: 'left',
      session: previous,
      user: this.currentUser
    });

    return { error };
  }

  getCurrentSession() {
    return this.currentSession;
  }
}

export const multiplayerSessionService = new MultiplayerSessionService();
export default multiplayerSessionService;
