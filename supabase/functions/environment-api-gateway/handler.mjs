const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeEnvironmentRequest(body) {
  const { provider, operation, requestId, locations } = body || {};
  const terrain = operation === 'elevation' && ['open_elevation', 'open_topo_data'].includes(provider);
  const weather = ['weather_radar', 'weather_current'].includes(operation) && provider === 'open_meteo';
  if ((!terrain && !weather) || !uuid.test(requestId || '') || !Array.isArray(locations)
    || locations.length < 1 || locations.length > (terrain ? 20 : 1)) throw new Error('Invalid API request.');
  const points = locations.map(point => {
    if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)
      || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw new Error('Invalid coordinates.');
    return { latitude: Number(point.latitude.toFixed(5)), longitude: Number(point.longitude.toFixed(5)) };
  });
  return { provider, operation, requestId, locations: points };
}

export function buildEnvironmentUrl(request) {
  const { provider, operation, locations } = request;
  const points = locations.map(point => `${point.latitude},${point.longitude}`).join('|');
  if (provider === 'open_elevation') return `https://api.open-elevation.com/api/v1/lookup?locations=${encodeURIComponent(points)}`;
  if (provider === 'open_topo_data') return `https://api.opentopodata.org/v1/aster30m?locations=${encodeURIComponent(points)}`;
  const current = operation === 'weather_radar' ? 'cloud_cover,precipitation'
    : 'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
  const params = new URLSearchParams({ latitude: String(locations[0].latitude), longitude: String(locations[0].longitude),
    current, wind_speed_unit: 'kn', precipitation_unit: 'mm', forecast_days: '1' });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function validEnvironmentResult(request, data) {
  if (request.operation === 'elevation') return Array.isArray(data?.results)
    && data.results.length === request.locations.length && data.results.every(row => Number.isFinite(row?.elevation));
  const fields = request.operation === 'weather_radar' ? ['cloud_cover', 'precipitation']
    : ['temperature_2m', 'relative_humidity_2m', 'cloud_cover', 'precipitation', 'pressure_msl', 'wind_speed_10m', 'wind_direction_10m'];
  return fields.every(field => Number.isFinite(data?.current?.[field]));
}

async function readBody(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('Missing request body.');
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16384) { await reader.cancel(); throw new Error('Request body too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createEnvironmentGateway({ authenticate, reserve, complete, identifyGuest, reserveGuest, completeGuest, fetchImpl = fetch, digest = async value => {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
} }) {
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ status: 'invalid_request' }, 405);
    let user;
    try { user = await authenticate(req); } catch { return json({ status: 'unavailable' }, 503); }
    let request;
    try { request = normalizeEnvironmentRequest(await readBody(req)); }
    catch { return json({ status: 'invalid_request', billing: { chargedTokens: 0 } }, 400); }
    const guest = !user?.id;
    let guestKey;
    if (guest) {
      if (request.provider !== 'open_meteo') return json({ status: 'unauthenticated', billing: { chargedTokens: 0 } }, 401);
      if (!identifyGuest || !reserveGuest || !completeGuest) return json({ status: 'unavailable' }, 503);
      guestKey = await identifyGuest(req);
      if (!guestKey) return json({ status: 'unavailable' }, 503);
      // Guest clients cannot request finer coordinates or a different forecast model.
      request.locations = request.locations.map(point => ({
        latitude: Math.max(-89.875, Math.min(89.875, (Math.floor(point.latitude / 0.25) + 0.5) * 0.25)),
        longitude: Math.max(-179.875, Math.min(179.875, (Math.floor(point.longitude / 0.25) + 0.5) * 0.25))
      }));
      // Current weather and radar share one coarse public forecast cache.
      request.operation = 'weather_current';
    }
    const { requestId, ...canonical } = request;
    const requestKey = await digest(JSON.stringify(canonical));
    let reservation;
    try { reservation = guest ? await reserveGuest(guestKey, requestId, requestKey)
      : await reserve(user.id, requestId, requestKey, request); }
    catch { return json({ status: 'unavailable', billing: { chargedTokens: 0 } }, 503); }
    if (!reservation || reservation.status !== 'reserved') return json(reservation || { status: 'unavailable' });
    // A reservation is durable. Browser cancellation must not erase recorded credit consumption.
    let data = null;
    let status = 'provider_failed';
    let upstreamStatus = 503;
    let retryAfterSeconds = 30;
    try {
      const response = await fetchImpl(buildEnvironmentUrl(request), { signal: AbortSignal.timeout(8000), redirect: 'error' });
      upstreamStatus = response.status;
      if (response.status === 429) {
        status = 'provider_rate_limited';
        const header = response.headers.get('Retry-After');
        const seconds = header == null ? NaN : Number(header);
        const delay = Number.isFinite(seconds) ? seconds : (Date.parse(header) - Date.now()) / 1000;
        retryAfterSeconds = Math.min(2678400, Math.max(60, Number.isFinite(delay) ? Math.ceil(delay) : 60));
      } else if (response.ok) {
        data = await response.json();
        if (validEnvironmentResult(request, data)) status = 'ok';
        else data = null;
      }
    } catch { /* Timeouts and invalid responses count as recorded API attempts. */ }
    try {
      const result = guest ? await completeGuest(guestKey, requestId, requestKey, { status, data, upstreamStatus, retryAfterSeconds })
        : await complete(user.id, requestId, { status, data, upstreamStatus, retryAfterSeconds });
      return json(result);
    } catch {
      // Never return unrecorded data or repeat an already dispatched request.
      return json({ status: 'unavailable', billing: reservation.billing }, 503);
    }
  };
}
