import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const RATE_LIMIT_PER_MINUTE = Number(Deno.env.get('ROUTE_API_RATE_LIMIT_PER_MINUTE') || '10');
const ROUTE_CREDIT_COST = 1;

type GatewayPayload = Record<string, unknown>;

type ProviderResult = {
  status: string;
  message?: string;
  data?: unknown;
  route?: unknown;
  metadata?: Record<string, unknown>;
};

type RouteReservationResult = {
  status: string;
  charged_tokens: number;
  window_start: string | null;
  call_count: number | null;
  token_balance: number | null;
};

type FlightPlanDbNode = Record<string, unknown> & {
  ident?: string;
  name?: string;
  code?: string;
  lat?: number | string;
  latitude?: number | string;
  lon?: number | string;
  longitude?: number | string;
  alt?: number | string;
  altitude?: number | string;
  via?: string;
  type?: string;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

const getProviderKey = (provider: string) => {
  switch (provider) {
    case 'SimBrief':
      return Deno.env.get('SIMBRIEF_API_KEY') || Deno.env.get('VITE_SIMBRIEF_API_KEY') || '';
    case 'FlightPlanDB':
      return Deno.env.get('FLIGHTPLANDATABASE_API_KEY') || Deno.env.get('VITE_FLIGHTPLANDATABASE_API_KEY') || '';
    case 'OpenAIP':
      return Deno.env.get('OPENAIP_CLIENT_KEY') || Deno.env.get('VITE_OPENAIP_CLIENT_KEY') || '';
    case 'ProcedureData':
      return Deno.env.get('PROCEDURE_DATA_API_KEY') || Deno.env.get('VITE_PROCEDURE_DATA_API_KEY') || '';
    case 'AirportReference':
      return Deno.env.get('AIRPORT_REFERENCE_API_KEY') || Deno.env.get('OPENAIP_CLIENT_KEY') || Deno.env.get('VITE_AIRPORT_REFERENCE_API_KEY') || Deno.env.get('VITE_OPENAIP_CLIENT_KEY') || '';
    case 'OurAirports':
      return Deno.env.get('OURAIRPORTS_DATA_URL') || Deno.env.get('VITE_OURAIRPORTS_DATA_URL') || 'https://davidmegginson.github.io/ourairports-data/airports.csv';
    case 'FAACIFP':
      return Deno.env.get('FAA_CIFP_API_KEY') || Deno.env.get('VITE_FAA_CIFP_API_KEY') || Deno.env.get('FAA_CIFP_DATA_URL') || Deno.env.get('VITE_FAA_CIFP_DATA_URL') || '';
    default:
      return '';
  }
};

const toText = (value: unknown) => String(value || '').trim();
const toUpper = (value: unknown) => toText(value).toUpperCase();

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
};

const parseCsv = (text: string) => {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine || '');
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((record, header, index) => ({ ...record, [header]: values[index] || '' }), {} as Record<string, unknown>);
  });
};

const buildFlightPlanDbAuthHeader = (key: string) => `Basic ${btoa(`${key}:`)}`;

const safeJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
};

async function reserveRouteApiCall(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  provider: string,
  payload: GatewayPayload
): Promise<RouteReservationResult | null> {
  const { data, error } = await supabase.rpc('reserve_route_api_call', {
    p_user_id: userId,
    p_limit_per_minute: RATE_LIMIT_PER_MINUTE,
    p_token_cost: ROUTE_CREDIT_COST,
    p_provider: provider,
    p_origin: payload.origin || null,
    p_destination: payload.destination || null
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data[0] as RouteReservationResult;
}


const normalizeFlightPlanDbNode = (node: Record<string, unknown>) => ({
  name: toUpper(node.ident || node.name || node.code || 'WPT'),
  latitude: Number(node.lat ?? node.latitude),
  longitude: Number(node.lon ?? node.longitude),
  altitude: typeof node.alt === 'number' ? node.alt : Number(node.alt || node.altitude) || null,
  airway: toText(node.via),
  type: toText(node.type || 'WAYPOINT').toUpperCase()
});

async function fetchFlightPlanDbRoute(payload: GatewayPayload, key: string): Promise<ProviderResult> {
  const origin = toUpper(payload.origin);
  const destination = toUpper(payload.destination);
  if (!origin || !destination) {
    return { status: 'provider_failed', message: 'Flight Plan Database requires origin and destination.' };
  }

  const authHeader = buildFlightPlanDbAuthHeader(key);
  const searchUrl = new URL('https://api.flightplandatabase.com/search/plans');
  searchUrl.searchParams.set('fromICAO', origin);
  searchUrl.searchParams.set('toICAO', destination);
  searchUrl.searchParams.set('limit', '1');

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: authHeader, Accept: 'application/json' }
  });
  const searchBody = await safeJson(searchResponse);

  if (!searchResponse.ok) {
    return { status: 'provider_failed', message: `Flight Plan Database search failed (${searchResponse.status}).`, data: searchBody };
  }

  const plan = Array.isArray(searchBody)
    ? searchBody[0] as FlightPlanDbPlan | undefined
    : Array.isArray((searchBody as Record<string, unknown>)?.data)
      ? ((searchBody as Record<string, unknown>).data as FlightPlanDbPlan[])[0]
      : null;
  const planId = plan?.id;
  if (!planId) {
    return { status: 'provider_failed', message: 'Flight Plan Database returned no matching route.' };
  }

  const planResponse = await fetch(`https://api.flightplandatabase.com/plan/${planId}`, {
    headers: { Authorization: authHeader, Accept: 'application/json' }
  });
  const planBody = await safeJson(planResponse) as Record<string, unknown> | null;
  const routeSection = planBody && typeof planBody.route === 'object' && planBody.route !== null
    ? planBody.route as Record<string, unknown>
    : null;

  if (!planResponse.ok || !planBody) {
    return { status: 'provider_failed', message: `Flight Plan Database plan lookup failed (${planResponse.status}).`, data: planBody };
  }

  const routeNodes = Array.isArray(routeSection?.nodes)
    ? routeSection.nodes
    : Array.isArray(planBody.nodes)
      ? planBody.nodes
      : [];

  const normalizedNodes = routeNodes
    .map((node) => normalizeFlightPlanDbNode(node as FlightPlanDbNode))
    .filter((node) => Number.isFinite(node.latitude) && Number.isFinite(node.longitude));

  if (!normalizedNodes.length) {
    return {
      status: 'provider_failed',
      message: 'Flight Plan Database route did not include usable waypoint coordinates.',
      data: planBody
    };
  }

  return {
    status: 'ok',
    route: {
      source: 'FlightPlanDB',
      routeString: Array.isArray(routeSection?.nodes)
        ? toText(routeSection.nodes.map((node) => {
            const typedNode = node as FlightPlanDbNode;
            return typedNode.ident || typedNode.name || typedNode.code || '';
          }).filter(Boolean).join(' '))
        : toText(routeSection || planBody.notes),
      waypoints: normalizedNodes,
      metadata: {
        planId,
        distance: planBody.distance || plan?.distance || null,
        maxAltitude: planBody.maxAltitude || plan?.maxAltitude || null
      }
    }
  };
}

const normalizeOpenAipReference = (item: Record<string, unknown>, type: string) => {
  const geometry = item.geometry as Record<string, unknown> | undefined;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry?.coordinates as number[] : [];
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);

  return {
    id: item._id || item.id || null,
    type: toText(item.type || type).toUpperCase(),
    name: toText(item.name || item.identifier || item.icaoCode || item.iataCode || 'REF'),
    identifier: toText(item.identifier || item.icaoCode || item.iataCode || item.altIdentifier || ''),
    icaoCode: toText(item.icaoCode || ''),
    iataCode: toText(item.iataCode || ''),
    country: item.country || null,
    latitude: Number.isFinite(latitude) ? latitude : Number(item.latitude ?? item.lat),
    longitude: Number.isFinite(longitude) ? longitude : Number(item.longitude ?? item.lon)
  };
};

async function fetchOpenAipReferences(payload: GatewayPayload, key: string): Promise<ProviderResult> {
  const type = toText(payload.type || 'navaid').toLowerCase();
  const query = toText(payload.query);
  const endpoint = type === 'airport' ? 'airports' : 'navaids';
  const url = new URL(`https://api.core.openaip.net/${endpoint}`);
  url.searchParams.set('limit', '10');
  if (query) url.searchParams.set('search', query);

  const response = await fetch(url, {
    headers: {
      'x-openaip-api-key': key,
      Accept: 'application/json'
    }
  });
  const body = await safeJson(response) as Record<string, unknown> | null;

  if (!response.ok || !body) {
    return { status: 'provider_failed', message: `OpenAIP lookup failed (${response.status}).`, data: body };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  return {
    status: 'ok',
    data: items.map((item) => normalizeOpenAipReference(item as Record<string, unknown>, type))
  };
}

const normalizeAirportReference = (item: Record<string, unknown>) => {
  const geometry = item.geometry as Record<string, unknown> | undefined;
  const coordinates = Array.isArray(geometry?.coordinates) ? geometry?.coordinates as number[] : [];
  const longitude = Number(coordinates[0] ?? item.longitude ?? item.lon);
  const latitude = Number(coordinates[1] ?? item.latitude ?? item.lat);

  return {
    id: item._id || item.id || item.identifier || item.icaoCode || item.iataCode || item.name || null,
    type: toText(item.type || 'airport').toLowerCase(),
    name: toText(item.name || item.identifier || item.icaoCode || item.iataCode || 'REF'),
    identifier: toText(item.identifier || item.icaoCode || item.iataCode || item.altIdentifier || ''),
    icao: toText(item.icaoCode || item.icao || ''),
    iata: toText(item.iataCode || item.iata || ''),
    icaoCode: toText(item.icaoCode || item.icao || ''),
    iataCode: toText(item.iataCode || item.iata || ''),
    city: toText(item.city || item.municipality || ''),
    country: item.country || item.countryCode || null,
    elevation: item.elevation || item.elevationFt || null,
    latitude,
    longitude,
    runways: Array.isArray(item.runways) ? item.runways : [],
    frequencies: Array.isArray(item.frequencies) ? item.frequencies : [],
    source: 'AirportReference'
  };
};

async function fetchAirportReferences(payload: GatewayPayload, key: string): Promise<ProviderResult> {
  const requestType = toText(payload.requestType || 'airport_search');
  const type = requestType === 'navaid_search' ? 'navaid' : 'airport';
  const endpoint = type === 'airport' ? 'airports' : 'navaids';
  const url = new URL(`https://api.core.openaip.net/${endpoint}`);
  url.searchParams.set('limit', requestType === 'navaid_search' ? '25' : '15');

  if (requestType === 'nearby_airports') {
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      url.searchParams.set('lat', String(latitude));
      url.searchParams.set('lon', String(longitude));
      url.searchParams.set('dist', String(Math.round(Number(payload.radiusNm || 120) * 1852)));
    }
  } else if (requestType === 'navaid_search') {
    const query = toText(payload.origin || payload.destination || payload.query);
    if (query) url.searchParams.set('search', query);
  } else {
    const query = toText(payload.query || payload.code);
    if (query) url.searchParams.set('search', query);
  }

  const response = await fetch(url, {
    headers: {
      'x-openaip-api-key': key,
      Accept: 'application/json'
    }
  });
  const body = await safeJson(response) as Record<string, unknown> | null;

  if (!response.ok || !body) {
    return { status: 'provider_failed', message: `Airport reference lookup failed (${response.status}).`, data: body };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const normalized = items.map((item) => normalizeAirportReference(item as Record<string, unknown>)).filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));

  if (type === 'navaid') {
    return { status: 'ok', navaids: normalized };
  }

  return { status: 'ok', airports: normalized, references: normalized };
}

async function fetchOurAirportsReferences(payload: GatewayPayload, dataUrl: string): Promise<ProviderResult> {
  const requestType = toText(payload.requestType || 'airport_search');
  const query = toUpper(payload.query || payload.code || payload.origin || payload.destination);
  const sourceUrl = requestType === 'navaid_search'
    ? (Deno.env.get('OURAIRPORTS_NAVAIDS_DATA_URL') || Deno.env.get('VITE_OURAIRPORTS_NAVAIDS_DATA_URL') || dataUrl.replace(/airports\.csv$/, 'navaids.csv'))
    : dataUrl;
  const response = await fetch(sourceUrl, { headers: { Accept: 'text/csv,*/*' } });
  const text = await response.text();

  if (!response.ok || !text) {
    return { status: 'provider_failed', message: `OurAirports lookup failed (${response.status}).` };
  }

  const records = parseCsv(text);
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const radiusNm = Number(payload.radiusNm || 120);
  const distanceNm = (airport: Record<string, unknown>) => {
    const lat = Number(airport.latitude_deg ?? airport.latitude);
    const lon = Number(airport.longitude_deg ?? airport.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(lat) || !Number.isFinite(lon)) return Infinity;
    const dLat = (lat - latitude) * 60;
    const dLon = (lon - longitude) * 60 * Math.cos(latitude * Math.PI / 180);
    return Math.hypot(dLat, dLon);
  };

  const normalized = filtered
    .map((record) => requestType === 'navaid_search'
      ? normalizeAirportReference({
          id: record.id,
          type: record.type || 'navaid',
          name: record.name || record.ident,
          identifier: record.ident,
          latitude: record.latitude_deg,
          longitude: record.longitude_deg,
          source: 'OurAirports'
        })
      : normalizeAirportReference({
          id: record.id,
          type: record.type,
          name: record.name,
          identifier: record.ident || record.gps_code || record.iata_code || record.local_code,
          icao: record.gps_code || record.ident,
          iata: record.iata_code,
          city: record.municipality,
          country: record.iso_country,
          elevation: record.elevation_ft,
          latitude: record.latitude_deg,
          longitude: record.longitude_deg,
          source: 'OurAirports'
        }))
    .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));

  if (requestType === 'navaid_search') {
    return { status: 'ok', navaids: normalized };
  }

  return { status: 'ok', airports: normalized, references: normalized };
}

async function fetchFaaCifpProcedures(payload: GatewayPayload, key: string): Promise<ProviderResult> {
  const endpoint = Deno.env.get('FAA_CIFP_DATA_URL') || Deno.env.get('VITE_FAA_CIFP_DATA_URL') || '';
  if (!endpoint) {
    return { status: 'unavailable', message: 'FAA CIFP procedure source is not configured for this deployment.' };
  }

  const url = new URL(endpoint);
  url.searchParams.set('origin', toUpper(payload.origin));
  url.searchParams.set('destination', toUpper(payload.destination));
  if (payload.departureRunway) url.searchParams.set('departureRunway', toText(payload.departureRunway));
  if (payload.arrivalRunway) url.searchParams.set('arrivalRunway', toText(payload.arrivalRunway));
  if (payload.aircraftType) url.searchParams.set('aircraftType', toText(payload.aircraftType));
  if (Deno.env.get('FAA_CIFP_CYCLE')) url.searchParams.set('cycle', Deno.env.get('FAA_CIFP_CYCLE') || '');

  const response = await fetch(url, {
    headers: {
      ...(key && !key.startsWith('http') ? { Authorization: `Bearer ${key}` } : {}),
      Accept: 'application/json'
    }
  });
  const body = await safeJson(response) as Record<string, unknown> | null;

  if (!response.ok || !body) {
    return { status: 'provider_failed', message: `FAA CIFP lookup failed (${response.status}).`, data: body };
  }

  return { status: 'ok', data: body, metadata: { cycle: body.cycle || Deno.env.get('FAA_CIFP_CYCLE') || null } };
}

async function fetchProcedureData(payload: GatewayPayload, key: string): Promise<ProviderResult> {
  const endpoint = Deno.env.get('PROCEDURE_DATA_API_URL') || Deno.env.get('VITE_PROCEDURE_DATA_API_URL') || '';
  if (!endpoint || !key) {
    return {
      status: 'unavailable',
      message: 'Published SID/STAR procedure provider is not configured for this deployment.',
      data: {
        origin: toUpper(payload.origin),
        destination: toUpper(payload.destination),
        requestType: 'procedures'
      }
    };
  }

  const url = new URL(endpoint);
  url.searchParams.set('origin', toUpper(payload.origin));
  url.searchParams.set('destination', toUpper(payload.destination));
  if (payload.departureRunway) url.searchParams.set('departureRunway', toText(payload.departureRunway));
  if (payload.arrivalRunway) url.searchParams.set('arrivalRunway', toText(payload.arrivalRunway));
  if (payload.aircraftType) url.searchParams.set('aircraftType', toText(payload.aircraftType));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  const body = await safeJson(response) as Record<string, unknown> | null;

  if (!response.ok || !body) {
    return { status: 'provider_failed', message: `Published procedure lookup failed (${response.status}).`, data: body };
  }

  return { status: 'ok', data: body };
}

async function fetchProvider(provider: string, payload: GatewayPayload, key: string): Promise<ProviderResult> {
  if (!key) {
    return { status: 'provider_failed', message: `${provider} API key is not configured.` };
  }

  if (provider === 'SimBrief') {
    return {
      status: 'provider_failed',
      message: 'SimBrief route proxy endpoint must be configured for this deployment.'
    };
  }

  if (provider === 'FlightPlanDB') {
    return fetchFlightPlanDbRoute(payload, key);
  }

  if (provider === 'OpenAIP') {
    return fetchOpenAipReferences(payload, key);
  }

  if (provider === 'ProcedureData') {
    return fetchProcedureData(payload, key);
  }

  if (provider === 'AirportReference') {
    return fetchAirportReferences(payload, key);
  }

  if (provider === 'OurAirports') {
    return fetchOurAirportsReferences(payload, key);
  }

  if (provider === 'FAACIFP') {
    return fetchFaaCifpProcedures(payload, key);
  }

  return { status: 'provider_failed', message: `Unknown route provider: ${provider}` };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ status: 'provider_failed', message: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ status: 'provider_failed', message: 'Supabase service configuration is missing.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user) {
    return json({ status: 'unauthenticated', message: 'Login required for key-guarded aviation API calls.' });
  }

  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider || '');
  const payload = body.payload || {};

  if (provider === 'ProcedureData' && (!getProviderKey(provider) || !(Deno.env.get('PROCEDURE_DATA_API_URL') || Deno.env.get('VITE_PROCEDURE_DATA_API_URL')))) {
    await adminClient.from('route_api_call_logs').insert({ user_id: user.id, provider, origin: payload.origin, destination: payload.destination, status: 'unavailable', charged_tokens: 0 });
    return json({
      status: 'unavailable',
      message: 'Published SID/STAR procedure provider is not configured for this deployment.',
      billing: { chargedTokens: 0 }
    });
  }

  const reservation = await reserveRouteApiCall(adminClient, user.id, provider, payload);
  if (!reservation) {
    await adminClient.from('route_api_call_logs').insert({ user_id: user.id, provider, origin: payload.origin, destination: payload.destination, status: 'provider_failed' });
    return json({ status: 'provider_failed', message: 'Could not reserve route API quota for this request.' }, 500);
  }

  if (reservation.status === 'rate_limited') {
    await adminClient.from('route_api_call_logs').insert({ user_id: user.id, provider, origin: payload.origin, destination: payload.destination, status: 'rate_limited' });
    return json({ status: 'rate_limited', message: 'Route API rate limit exceeded. Falling back to local routing.' });
  }

  if (reservation.status !== 'ok') {
    return json({ status: reservation.status, billing: { chargedTokens: 0, creditsConsumed: 0 } });
  }

  const providerResult = await fetchProvider(provider, payload, getProviderKey(provider));
  if (providerResult.status !== 'ok') {
    await adminClient.from('route_api_call_logs').insert({ user_id: user.id, provider, origin: payload.origin, destination: payload.destination, status: providerResult.status, charged_tokens: 0 });
    return json({ ...providerResult, billing: { chargedTokens: 0, creditsConsumed: 1, settlement: 'deferred' } });
  }

  await adminClient.from('route_api_call_logs').insert({ user_id: user.id, provider, origin: payload.origin, destination: payload.destination, status: 'ok', charged_tokens: 0 });
  return json({ ...providerResult, billing: { chargedTokens: 0, creditsConsumed: 1, settlement: 'deferred' } });
});
