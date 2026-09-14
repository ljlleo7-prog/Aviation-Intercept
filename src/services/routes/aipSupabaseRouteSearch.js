import { supabase } from '../aviationIntercept/SupabaseClient.js';
import { PROVIDER_STATUS, ROUTE_SOURCES } from './routeTypes.js';

const DEFAULT_AIP_CYCLE = '2605';

const getAirportCode = (airport) => {
  const candidates = [airport?.icao, airport?.ident, airport?.gpsCode, airport?.airport, airport?.code, airport?.iata]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  return candidates.find((code) => /^[A-Z0-9]{4}$/.test(code)) || candidates[0] || '';
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeWaypoint = (waypoint, index, total) => ({
  name: waypoint.name || waypoint.label || 'WPT',
  label: waypoint.label || waypoint.name || 'WPT',
  latitude: toNumber(waypoint.latitude),
  longitude: toNumber(waypoint.longitude),
  type: waypoint.type || 'WAYPOINT',
  segment: index === 0 ? 'departure' : (index === total - 1 ? 'arrival' : (waypoint.segment || 'enroute')),
  source: ROUTE_SOURCES.SUPABASE_AIP,
  airway: waypoint.airway || '',
  frequencyKhz: toNumber(waypoint.frequencyKhz),
  associatedAirport: waypoint.associatedAirport || '',
  isoCountry: waypoint.isoCountry || '',
  sourceSystem: waypoint.sourceSystem || ''
});

export const searchSupabaseAipRoute = async ({ departure, arrival, options = {} } = {}) => {
  const departureCode = getAirportCode(departure);
  const arrivalCode = getAirportCode(arrival);

  if (!supabase) {
    return {
      status: PROVIDER_STATUS.UNAVAILABLE,
      message: 'Supabase is not configured for AIP route search.',
      billing: { chargedTokens: 0 }
    };
  }

  if (!departureCode || !arrivalCode) {
    return {
      status: PROVIDER_STATUS.UNAVAILABLE,
      message: 'Supabase AIP route search requires departure and arrival airport codes.',
      billing: { chargedTokens: 0 }
    };
  }

  try {
    const { data, error } = await supabase.rpc('skylinetragedy_search_aip_route', {
      p_departure_code: departureCode,
      p_arrival_code: arrivalCode,
      p_region_code: options.regionCode || '*',
      p_aip_cycle: options.aipCycle || DEFAULT_AIP_CYCLE,
      p_limit: options.limit || 1
    });

    if (error) {
      return {
        status: PROVIDER_STATUS.PROVIDER_FAILED,
        message: error.message || 'Supabase AIP route search failed.',
        billing: { chargedTokens: 0 }
      };
    }

    const response = data || {};
    if (response.status !== PROVIDER_STATUS.OK) {
      return {
        status: response.status || PROVIDER_STATUS.UNAVAILABLE,
        message: response.message || 'No Supabase AIP route found for this airport pair.',
        metrics: response.metrics || null,
        billing: { chargedTokens: 0 }
      };
    }

    const rawWaypoints = Array.isArray(response.route?.waypoints) ? response.route.waypoints : [];
    const waypoints = rawWaypoints
      .map((waypoint, index) => normalizeWaypoint(waypoint, index, rawWaypoints.length))
      .filter((waypoint) => Number.isFinite(waypoint.latitude) && Number.isFinite(waypoint.longitude));

    if (!waypoints.length) {
      return {
        status: PROVIDER_STATUS.UNAVAILABLE,
        message: 'Supabase AIP route did not include usable waypoint coordinates.',
        metrics: response.metrics || null,
        billing: { chargedTokens: 0 }
      };
    }

    const metrics = {
      ...(response.metrics || {}),
      method: response.metrics?.method || 'supabase-indexed'
    };

    return {
      status: PROVIDER_STATUS.OK,
      route: {
        waypoints,
        source: ROUTE_SOURCES.SUPABASE_AIP,
        metadata: {
          routeId: response.route?.routeId || '',
          routeCode: response.route?.routeCode || '',
          routeString: response.route?.routeString || '',
          regionCode: response.route?.regionCode || '',
          aipCycle: response.route?.aipCycle || '',
          supabaseAipMetrics: metrics,
          localAipLegs: Array.isArray(response.route?.legs) ? response.route.legs : []
        },
        billing: { chargedTokens: 0 }
      },
      metrics,
      billing: { chargedTokens: 0 }
    };
  } catch (error) {
    return {
      status: PROVIDER_STATUS.PROVIDER_FAILED,
      message: error.message || 'Supabase AIP route request failed.',
      billing: { chargedTokens: 0 }
    };
  }
};
