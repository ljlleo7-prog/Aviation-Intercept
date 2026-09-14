import eventBus from '../eventBus.js';
import { createRealtimeChannel, supabase } from '../aviationIntercept/SupabaseClient.js';

function roundNumber(value, digits = 5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(numeric.toFixed(digits));
}

function buildTrafficSnapshot({ sessionId, namespaceKey, userId, callsign, aircraftType, flightData, role = 'pilot' }) {
  if (!flightData?.position) {
    return null;
  }

  return {
    sessionId,
    namespaceKey,
    userId,
    role,
    callsign,
    aircraftType,
    latitude: roundNumber(flightData.position.latitude, 6),
    longitude: roundNumber(flightData.position.longitude, 6),
    altitudeFt: roundNumber(flightData.altitude ?? flightData.derived?.altitude_ft ?? 0, 0),
    heading: roundNumber(flightData.heading ?? flightData.derived?.heading ?? 0, 1),
    indicatedAirspeed: roundNumber(flightData.indicatedAirspeed ?? 0, 1),
    groundSpeed: roundNumber(flightData.groundSpeed ?? flightData.derived?.groundSpeed ?? 0, 1),
    verticalSpeed: roundNumber(flightData.verticalSpeed ?? 0, 0),
    timestamp: Date.now()
  };
}

class TrafficSyncService {
  constructor() {
    this.presenceChannel = null;
    this.trafficChannel = null;
    this.eventChannel = null;
    this.remoteTraffic = new Map();
    this.lastBroadcastAt = 0;
    this.broadcastIntervalMs = 200;
    this.currentSessionId = null;
    this.currentNamespaceKey = null;
    this.currentUserId = null;
  }

  async connect({ namespaceKey, sessionId, userId, callsign, aircraftType, role = 'pilot' }) {
    this.disconnect();

    if (!supabase || !namespaceKey || !sessionId || !userId) {
      return { connected: false };
    }

    this.currentNamespaceKey = namespaceKey;
    this.currentSessionId = sessionId;
    this.currentUserId = userId;

    this.presenceChannel = createRealtimeChannel(namespaceKey, sessionId, 'presence', {
      config: { presence: { key: userId } }
    });
    this.trafficChannel = createRealtimeChannel(namespaceKey, sessionId, 'traffic');
    this.eventChannel = createRealtimeChannel(namespaceKey, sessionId, 'events');

    this.presenceChannel
      ?.on('presence', { event: 'sync' }, () => {
        const state = this.presenceChannel.presenceState();
        eventBus.publishWithMetadata(eventBus.Types.MULTIPLAYER_STATUS_CHANGED, {
          status: 'presence-sync',
          sessionId,
          namespaceKey,
          presence: state
        });
      });

    this.trafficChannel
      ?.on('broadcast', { event: 'aircraft_state' }, ({ payload }) => {
        if (!payload || payload.userId === this.currentUserId) {
          return;
        }

        this.remoteTraffic.set(payload.userId, payload);
        eventBus.publishWithMetadata(eventBus.Types.MULTIPLAYER_TRAFFIC_UPDATED, {
          sessionId,
          namespaceKey,
          traffic: Array.from(this.remoteTraffic.values())
        });
      });

    this.eventChannel
      ?.on('broadcast', { event: 'flight_event' }, ({ payload }) => {
        eventBus.publishWithMetadata(eventBus.Types.MULTIPLAYER_EVENT_RECEIVED, {
          sessionId,
          namespaceKey,
          event: payload
        });
      });

    await Promise.all([
      this.presenceChannel?.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.presenceChannel.track({ userId, callsign, aircraftType, role, onlineAt: new Date().toISOString() });
        }
      }),
      this.trafficChannel?.subscribe(),
      this.eventChannel?.subscribe()
    ]);

    return { connected: true };
  }

  broadcastTraffic({ sessionId, namespaceKey, userId, callsign, aircraftType, flightData, role = 'pilot' }) {
    if (!this.trafficChannel || !flightData?.position) {
      return;
    }

    const now = Date.now();
    if (now - this.lastBroadcastAt < this.broadcastIntervalMs) {
      return;
    }

    const snapshot = buildTrafficSnapshot({ sessionId, namespaceKey, userId, callsign, aircraftType, flightData, role });
    if (!snapshot) {
      return;
    }

    this.lastBroadcastAt = now;
    this.trafficChannel.send({
      type: 'broadcast',
      event: 'aircraft_state',
      payload: snapshot
    });
  }

  broadcastEvent(payload) {
    if (!this.eventChannel || !payload) {
      return;
    }

    this.eventChannel.send({
      type: 'broadcast',
      event: 'flight_event',
      payload: {
        ...payload,
        timestamp: Date.now()
      }
    });
  }

  getRemoteTraffic() {
    return Array.from(this.remoteTraffic.values());
  }

  disconnect() {
    [this.presenceChannel, this.trafficChannel, this.eventChannel].forEach(channel => {
      if (channel) {
        supabase?.removeChannel(channel);
      }
    });

    this.presenceChannel = null;
    this.trafficChannel = null;
    this.eventChannel = null;
    this.remoteTraffic.clear();
    this.lastBroadcastAt = 0;
    this.currentSessionId = null;
    this.currentNamespaceKey = null;
    this.currentUserId = null;
  }
}

export const trafficSyncService = new TrafficSyncService();
export default trafficSyncService;
