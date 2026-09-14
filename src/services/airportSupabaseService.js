import { supabase } from './aviationIntercept/SupabaseClient.js';

const ok = (dataKey, value) => ({ status: 'ok', [dataKey]: value });
const unavailable = (message) => ({ status: 'unavailable', message });

const normalizeFrequency = (frequency = {}) => ({
  type: frequency.type || frequency.description || 'UNKNOWN',
  frequency: Number(frequency.frequency ?? frequency.frequency_mhz ?? 0),
  description: frequency.description || ''
});

const normalizeRunway = (runway = {}) => ({
  name: runway.name || '',
  length: Number(runway.length ?? runway.length_ft ?? 0),
  width: Number(runway.width ?? runway.width_ft ?? 0) || null,
  surface: runway.surface || 'Unknown',
  category: runway.category || '',
  bearing: runway.bearing ?? runway.bearing_deg ?? null,
  startLatitude: runway.startLatitude ?? runway.start_latitude_deg ?? null,
  startLongitude: runway.startLongitude ?? runway.start_longitude_deg ?? null,
  endLatitude: runway.endLatitude ?? runway.end_latitude_deg ?? null,
  endLongitude: runway.endLongitude ?? runway.end_longitude_deg ?? null
});

export const normalizeSupabaseAirport = (airport = {}) => ({
  iata: airport.iata || '',
  icao: airport.icao || airport.ident || '',
  ident: airport.ident || airport.icao || '',
  name: airport.name || '',
  latitude: Number(airport.latitude ?? airport.latitude_deg),
  longitude: Number(airport.longitude ?? airport.longitude_deg),
  city: airport.city || '',
  country: airport.country || airport.isoCountry || airport.iso_country || '',
  isoCountry: airport.isoCountry || airport.iso_country || '',
  region: airport.region || airport.region_code || '',
  elevation: Number(airport.elevation ?? airport.elevation_ft ?? 0),
  type: airport.type || airport.airport_type || 'normal',
  category: airport.category || '',
  distanceNm: airport.distanceNm ?? airport.distance_nm ?? null,
  runways: Array.isArray(airport.runways) ? airport.runways.map(normalizeRunway) : [],
  frequencies: Array.isArray(airport.frequencies) ? airport.frequencies.map(normalizeFrequency) : []
});

const rpc = async (name, params) => {
  if (!supabase) return unavailable('Supabase is not configured.');
  const { data, error } = await supabase.rpc(name, params);
  if (error) return { status: 'provider_failed', message: error.message || `${name} failed.` };
  return data || unavailable(`${name} returned no data.`);
};

export const searchSupabaseAirports = async (query, options = {}) => {
  const response = await rpc('skylinetragedy_search_airports', {
    p_query: query || '',
    p_limit: options.limit || 20,
    p_include_emergency: options.includeEmergency !== false
  });
  if (response.status !== 'ok') return response;
  return ok('airports', (response.airports || []).map(normalizeSupabaseAirport));
};

export const getSupabaseAirportsWithinRadius = async (latitude, longitude, radiusNm, options = {}) => {
  const response = await rpc('skylinetragedy_airports_within_radius', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_nm: radiusNm,
    p_limit: options.limit || 50
  });
  if (response.status !== 'ok') return response;
  return ok('airports', (response.airports || []).map(normalizeSupabaseAirport));
};

export const getSupabaseAirportDetails = async (code) => {
  const response = await rpc('skylinetragedy_airport_details', {
    p_airport_code: code || ''
  });
  if (response.status !== 'ok') return response;
  return ok('airport', normalizeSupabaseAirport(response.airport || {}));
};

export const findSupabaseEmergencyLandingOptions = async ({
  latitude,
  longitude,
  aircraftCategory = '',
  minRunwayLengthFt = 0,
  maxRadiusNm = 150,
  limit = 10
} = {}) => {
  const response = await rpc('skylinetragedy_nearest_suitable_airports', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_aircraft_category: aircraftCategory || null,
    p_min_runway_length_ft: minRunwayLengthFt,
    p_radius_nm: maxRadiusNm,
    p_limit: limit
  });
  if (response.status !== 'ok') return response;

  return ok('options', (response.options || []).map((option) => ({
    airport: normalizeSupabaseAirport(option.airport || {}),
    bestRunway: normalizeRunway(option.bestRunway || {}),
    distanceNm: option.distanceNm ?? null,
    suitabilityScore: option.suitabilityScore ?? null,
    frequencies: Array.isArray(option.frequencies) ? option.frequencies.map(normalizeFrequency) : [],
    navaids: Array.isArray(option.navaids) ? option.navaids : []
  })));
};

export const getSupabaseNavaidsNearRoute = async ({ latitude, longitude, radiusNm = 150, limit = 10 } = {}) => {
  const response = await rpc('skylinetragedy_nearest_navaids', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_nm: radiusNm,
    p_limit: limit
  });
  if (response.status !== 'ok') return response;
  return ok('navaids', response.navaids || []);
};
