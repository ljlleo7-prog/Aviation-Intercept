import { supabase } from './aviationIntercept/SupabaseClient.js';
import { notifyApiUsage } from './environmentApiClient.js';
import { isOfflineMode } from '../utils/appNetworkMode.js';

const cache = new Map();
const pending = new Map();
// Server RPCs enforce wallet charging and quota atomically. Cache only within
// the current user session, so a logout cannot expose a previous user's results.
export async function callAipRpc(name, params) {
  const offlineResponse = { status: 'unavailable', message: 'Cloud AIP is disabled in offline mode.', billing: { chargedTokens: 0, creditsConsumed: 0 } };
  if (isOfflineMode()) return offlineResponse;
  try {
    if (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('app_settings') || '{}').offlineMode === true) {
      return { status: 'unavailable', message: 'Cloud AIP is disabled in offline mode.', billing: { chargedTokens: 0, creditsConsumed: 0 } };
    }
  } catch { /* Storage may be unavailable. Server authentication still applies. */ }
  if (!supabase) return { status: 'unavailable', billing: { chargedTokens: 0, creditsConsumed: 0 } };
  const { data, error } = await supabase.auth.getSession();
  if (isOfflineMode()) return offlineResponse;
  const user = data?.session?.user;
  if (error || !user) return { status: 'unauthenticated', message: 'Log in to use cloud AIP credits.', billing: { chargedTokens: 0, creditsConsumed: 0 } };
  const key = JSON.stringify([user.id, name, params]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return { ...cached.response, cached: true, billing: { chargedTokens: 0, creditsConsumed: 0 } };
  if (pending.has(key)) return pending.get(key).then(response => ({ ...response, billing: { chargedTokens: 0, creditsConsumed: 0 }, shared: true }));
  const request = supabase.rpc(name, params).then(({ data: response, error: rpcError }) => {
    notifyApiUsage();
    if (rpcError) return { status: 'provider_failed', message: rpcError.message, billing: { chargedTokens: 0, creditsConsumed: 0 } };
    const value = response || { status: 'unavailable', billing: { chargedTokens: 0, creditsConsumed: 0 } };
    if (cache.size >= 500) cache.delete(cache.keys().next().value);
    if (value.status === 'ok') cache.set(key, { response: value, expires: Date.now() + 15 * 60000 });
    return value;
  }).catch(reason => ({ status: 'provider_failed', message: reason.message, billing: { chargedTokens: 0, creditsConsumed: 0 } }))
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
