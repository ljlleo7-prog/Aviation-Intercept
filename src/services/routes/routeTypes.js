export const ROUTE_SOURCES = Object.freeze({
  SIMBRIEF: 'SimBrief',
  FLIGHT_PLAN_DB: 'FlightPlanDB',
  OPEN_AIP: 'OpenAIP',
  PROCEDURE_DATA: 'ProcedureData',
  AIRPORT_REFERENCE: 'AirportReference',
  OUR_AIRPORTS: 'OurAirports',
  FAA_CIFP: 'FAACIFP',
  LOCAL_AIP: 'LocalAIP',
  SUPABASE_AIP: 'SupabaseAIP',
  BUILT_IN: 'Built-in'
});

export const PROVIDER_STATUS = Object.freeze({
  OK: 'ok',
  UNAUTHENTICATED: 'unauthenticated',
  RATE_LIMITED: 'rate_limited',
  INSUFFICIENT_TOKENS: 'insufficient_tokens',
  PROVIDER_FAILED: 'provider_failed',
  UNAVAILABLE: 'unavailable',
  CACHE_HIT: 'cache_hit'
});

export const AIP_PROVIDER_MODES = Object.freeze({
  LOCAL_ONLY: 'local-only',
  REMOTE_FIRST: 'remote-first',
  EXTERNAL_ONLY: 'external-only'
});

export const ROUTE_CACHE_VERSION = 'route-v5-bounded-stations';
export const EXTERNAL_ROUTE_TTL_MS = 24 * 60 * 60 * 1000;
export const REFERENCE_DATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const createRouteLeg = ({
  from = '',
  to = '',
  type = 'fix',
  altitude = null,
  speed = null,
  source = ROUTE_SOURCES.BUILT_IN,
  latitude = null,
  longitude = null,
  airway = '',
  sequence = 0,
  provider = source
} = {}) => ({
  from,
  to,
  type,
  altitude,
  speed,
  source,
  provider,
  latitude,
  longitude,
  airway,
  sequence
});

export const createRouteDebugEntry = ({
  provider,
  status,
  message = '',
  fallback = false,
  cached = false,
  billing = null
}) => ({
  provider,
  status,
  message,
  fallback,
  cached,
  billing,
  timestamp: new Date().toISOString()
});
