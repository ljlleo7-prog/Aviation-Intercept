import { isOfflineMode } from '../utils/appNetworkMode.js';
const listeners = new Set();
export function subscribeApiUsage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function notifyApiUsage() { listeners.forEach(listener => listener()); }
const getClient = async () => (await import('./aviationIntercept/SupabaseClient.js')).supabase;
const isOffline = isOfflineMode;

export function environmentRequestFromUrl(input) {
  const url = new URL(input);
  const providers = {
    'https://api.open-elevation.com/api/v1/lookup': 'open_elevation',
    'https://api.opentopodata.org/v1/aster30m': 'open_topo_data',
    'https://api.open-meteo.com/v1/forecast': 'open_meteo'
  };
  const provider = providers[url.origin + url.pathname];
  if (!provider || url.username || url.password) throw new Error('Unsupported environment provider.');
  const terrain = provider !== 'open_meteo';
  const locations = terrain
    ? (url.searchParams.get('locations') || '').split('|').map(value => {
      const [latitude, longitude] = value.split(',').map(Number);
      return { latitude, longitude };
    })
    : [{ latitude: Number(url.searchParams.get('latitude')), longitude: Number(url.searchParams.get('longitude')) }];
  return { provider, operation: terrain ? 'elevation'
    : url.searchParams.get('current') === 'cloud_cover,precipitation' ? 'weather_radar' : 'weather_current', locations };
}

export function createEnvironmentApiClient({ client = getClient, offline = isOffline, requestId = () => crypto.randomUUID() } = {}) {
  const denied = (status, httpStatus = 503, retry = 60) => new Response(JSON.stringify({ status }), {
    status: httpStatus, headers: { 'Content-Type': 'application/json', 'Retry-After': String(retry) }
  });
  return async (url, { signal } = {}) => {
    if (signal?.aborted) throw signal.reason;
    if (offline()) return denied('offline');
    const request = environmentRequestFromUrl(url);
    const supabase = await client();
    if (!supabase?.auth || !supabase?.functions) return denied('unavailable');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (signal?.aborted) throw signal.reason;
    if (offline()) return denied('offline');
    const guest = sessionError || !sessionData?.session?.user;
    if (guest && request.provider !== 'open_meteo') return denied('unauthenticated', 401);
    // Identity, token price and quotas are derived and checked again on the server.
    const { data, error } = await supabase.functions.invoke('environment-api-gateway', {
      body: { ...request, requestId: requestId() }, signal,
      // Guest weather is explicitly public; do not send an anon key as a user JWT.
      ...(guest ? { headers: { Authorization: '' } } : {})
    });
    notifyApiUsage();
    if (error || !data) return denied('unavailable');
    if (data.status === 'ok') return new Response(JSON.stringify(data.data), {
      headers: { 'Content-Type': 'application/json' }
    });
    const status = data.status === 'unauthenticated' ? 401 : data.status === 'insufficient_tokens' ? 402
      : ['pending', 'rate_limited', 'provider_rate_limited', 'budget_exhausted', 'user_limit_reached', 'daily_limit_reached'].includes(data.status) ? 429 : 503;
    return denied(data.status, status, data.retryAfterSeconds || 60);
  };
}

export const fetchMeteredEnvironmentResponse = createEnvironmentApiClient();

export async function getApiUsageSummary() {
  if (isOfflineMode()) return { status: 'offline' };
  const supabase = await getClient();
  if (!supabase) return { status: 'unavailable' };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (isOfflineMode()) return { status: 'offline' };
  if (sessionError || !sessionData?.session?.user) return { status: 'unauthenticated' };
  const { data, error } = await supabase.rpc('get_api_usage_summary');
  if (error) throw new Error('API usage is unavailable. The server may need the API credits migration.');
  return data || { status: 'unavailable' };
}

// A small read-only RPC for the FPS tab; querying usage consumes no credits.
export async function getDailyApiCreditUsage() {
  if (isOfflineMode()) return { status: 'offline' };
  const supabase = await getClient();
  if (!supabase) return { status: 'unavailable' };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (isOfflineMode()) return { status: 'offline' };
  if (sessionError || !sessionData?.session?.user) return { status: 'unauthenticated' };
  const { data, error } = await supabase.rpc('get_daily_api_credit_usage');
  if (error) throw new Error('Daily API credit usage is unavailable.');
  return data || { status: 'unavailable' };
}
