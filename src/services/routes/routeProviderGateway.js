import { PROVIDER_STATUS } from './routeTypes.js';
import { buildProviderNegativeCacheKey, getCachedProviderNegative, setCachedProviderNegative } from './routeCacheService.js';

const getSupabaseClient = async () => {
  try {
    const module = await import('../aviationIntercept/SupabaseClient.js');
    return module?.supabase || module?.default || null;
  } catch (_error) {
    return null;
  }
};

export const callGuardedRouteProvider = async ({ provider, payload = {}, mockResponse = null } = {}) => {
  if (mockResponse) return mockResponse;

  const supabase = await getSupabaseClient();
  if (!supabase?.auth || !supabase?.functions) {
    return {
      status: PROVIDER_STATUS.UNAUTHENTICATED,
      message: 'Supabase auth or functions are not configured for guarded route providers.'
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session?.user) {
    return {
      status: PROVIDER_STATUS.UNAUTHENTICATED,
      message: 'Login required for key-guarded aviation API calls.'
    };
  }

  const negativeCacheKey = buildProviderNegativeCacheKey({ provider, payload, authState: 'authenticated' });
  const cachedNegative = getCachedProviderNegative(negativeCacheKey);
  if (cachedNegative) {
    return cachedNegative;
  }

  try {
    const { data, error } = await supabase.functions.invoke('route-provider-gateway', {
      body: {
        provider,
        payload
      }
    });

    if (error) {
      const failed = {
        status: PROVIDER_STATUS.PROVIDER_FAILED,
        message: error.message || 'Route provider gateway failed.'
      };
      setCachedProviderNegative(negativeCacheKey, failed);
      return failed;
    }

    const response = data || {
      status: PROVIDER_STATUS.PROVIDER_FAILED,
      message: 'Route provider gateway returned an empty response.'
    };

    if (response.status !== PROVIDER_STATUS.OK) {
      setCachedProviderNegative(negativeCacheKey, response);
    }

    return response;
  } catch (error) {
    const failed = {
      status: PROVIDER_STATUS.PROVIDER_FAILED,
      message: error.message || 'Route provider gateway request failed.'
    };
    setCachedProviderNegative(negativeCacheKey, failed);
    return failed;
  }
};
