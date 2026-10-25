import { fetchMeteredEnvironmentResponse } from './environmentApiClient.js';

// Both terrain consumers share the provider budget. A missing response means
// deferred work, never sea-level data; callers may retry after the cooldown.
export function createElevationRequester({ fetchImpl = (...args) => fetch(...args), now = () => Date.now() } = {}) {
  const providers = new Map();
  return async (url, options) => {
    const provider = new URL(url).origin;
    const state = providers.get(provider) || { busy: false, nextAt: 0, failures: 0 };
    providers.set(provider, state);
    if (state.busy || now() < state.nextAt) return null;
    state.busy = true;
    state.nextAt = now() + 1000;
    const backoff = () => Math.min(300000, 30000 * 2 ** Math.min(state.failures++, 4));
    try {
      const response = await fetchImpl(url, options);
      if (response.status === 429) {
        const retryAfter = response.headers?.get('Retry-After');
        const seconds = retryAfter === null || retryAfter === undefined ? NaN : Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now();
        state.nextAt = now() + Math.max(backoff(), Number.isFinite(delay) ? delay : 0);
      } else if (response.ok) {
        state.failures = 0;
      } else {
        state.nextAt = now() + backoff();
      }
      return response;
    } catch (error) {
      // Leaving a view is cancellation, not a provider failure. Timeouts still back off.
      if (!options?.signal?.aborted || options.signal.reason?.name === 'TimeoutError') {
        state.nextAt = now() + backoff();
      }
      throw error;
    } finally {
      state.busy = false;
    }
  };
}

export const fetchElevationResponse = createElevationRequester({ fetchImpl: fetchMeteredEnvironmentResponse });
