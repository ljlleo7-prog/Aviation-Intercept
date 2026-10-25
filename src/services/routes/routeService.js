import { loadInstalledAipPack } from '../aipPackStorage.js';
import { isOfflineMode } from '../../utils/appNetworkMode.js';
import { fetchFlightPlanDbRoute } from './adapters/flightPlanDbAdapter.js';
import { fetchProcedureData } from './adapters/procedureDataAdapter.js';
import { fetchFaaCifpProcedures } from './adapters/faaCifpAdapter.js';
import { searchSupabaseAipRoute } from './aipSupabaseRouteSearch.js';
import { searchLocalAipRouteAlternatives } from './aipRouteSearch.js';
import { getNavaidReferencesAlongRoute } from './adapters/airportReferenceAdapter.js';
import { getOurAirportsNavaidsAlongRoute } from './adapters/ourAirportsAdapter.js';
import { buildBuiltInRoute } from './adapters/builtInRouteAdapter.js';
import { normalizeRoute } from './routeNormalizer.js';
import { appendRouteDebug, createRouteDebugLog, summarizeFallback } from './routeDebug.js';
import { buildRouteCacheKey, getCachedRoute, setCachedRoute } from './routeCacheService.js';
import { AIP_PROVIDER_MODES, PROVIDER_STATUS, EXTERNAL_ROUTE_TTL_MS, ROUTE_SOURCES } from './routeTypes.js';

const guardedRouteProviders = [fetchFlightPlanDbRoute];

const buildRouteWithProcedures = (route, procedureResponse) => {
  const procedureData = procedureResponse?.procedureData;
  if (!procedureData?.waypoints?.length) return route;

  const existingBilling = Number(route.billing?.chargedTokens || 0);
  const procedureBilling = Number(procedureResponse.billing?.chargedTokens || 0);

  return {
    ...route,
    waypoints: procedureData.waypoints,
    procedures: procedureData.procedures,
    procedureSegments: procedureData.procedureSegments,
    sid: procedureData.sid,
    star: procedureData.star,
    metadata: {
      ...(route.metadata || {}),
      procedureSource: procedureData.source,
      procedureMetadata: procedureData.metadata || null
    },
    billing: {
      chargedTokens: existingBilling + procedureBilling
    }
  };
};

const getBestProcedureResponse = async ({ departure, arrival, aircraftType, options, debugResponses, debug, authState } = {}) => {
  if (authState !== 'authenticated') {
    appendRouteDebug(debug, { provider: ROUTE_SOURCES.PROCEDURE_DATA, status: PROVIDER_STATUS.UNAUTHENTICATED, message: 'Procedure data skipped for unauthenticated requests.', fallback: true, billing: { chargedTokens: 0 } });
    return null;
  }
  const request = {
    departure,
    arrival,
    aircraftType,
    departureRunway: options.departureRunway || options.departureRunwayName || '',
    landingRunway: options.landingRunway || options.arrivalRunway || ''
  };

  const procedureResponse = await fetchProcedureData({
    ...request,
    debugResponse: debugResponses.fetchProcedureData || null
  });

  if (procedureResponse?.status === PROVIDER_STATUS.OK && procedureResponse.procedureData?.waypoints?.length) {
    appendRouteDebug(debug, { provider: ROUTE_SOURCES.PROCEDURE_DATA, status: PROVIDER_STATUS.OK, message: 'Published procedure data loaded', billing: procedureResponse.billing });
    return procedureResponse;
  }

  appendRouteDebug(debug, {
    provider: ROUTE_SOURCES.PROCEDURE_DATA,
    status: procedureResponse?.status || PROVIDER_STATUS.UNAVAILABLE,
    message: procedureResponse?.message || 'Published procedure data unavailable; trying FAA CIFP where applicable.',
    fallback: true,
    billing: procedureResponse?.billing || { chargedTokens: 0 }
  });

  const cifpResponse = await fetchFaaCifpProcedures({
    ...request,
    debugResponse: debugResponses.fetchFaaCifpProcedures || null
  });

  if (cifpResponse?.status === PROVIDER_STATUS.OK && cifpResponse.procedureData?.waypoints?.length) {
    appendRouteDebug(debug, { provider: ROUTE_SOURCES.FAA_CIFP, status: PROVIDER_STATUS.OK, message: 'FAA CIFP procedure data loaded', billing: cifpResponse.billing });
    return cifpResponse;
  }

  appendRouteDebug(debug, {
    provider: ROUTE_SOURCES.FAA_CIFP,
    status: cifpResponse?.status || PROVIDER_STATUS.UNAVAILABLE,
    message: cifpResponse?.message || 'FAA CIFP procedure data unavailable; using route waypoints only.',
    fallback: true,
    billing: cifpResponse?.billing || { chargedTokens: 0 }
  });

  return procedureResponse;
};

const buildReferenceEnrichedRoute = (route, referenceResponse) => {
  const navaids = Array.isArray(referenceResponse?.navaids) ? referenceResponse.navaids : [];
  if (!navaids.length) return route;

  return normalizeRoute({
    ...route,
    waypoints: navaids.slice(0, 8).map((navaid) => ({
      name: navaid.identifier || navaid.name,
      label: navaid.identifier || navaid.name,
      latitude: navaid.latitude,
      longitude: navaid.longitude,
      type: navaid.type || 'NAVAID',
      segment: 'enroute',
      source: ROUTE_SOURCES.AIRPORT_REFERENCE
    })),
    source: ROUTE_SOURCES.AIRPORT_REFERENCE,
    sourceChain: [...(route.sourceChain || []), ROUTE_SOURCES.AIRPORT_REFERENCE],
    fallbackUsed: true,
    metadata: {
      ...(route.metadata || {}),
      referenceEnriched: true
    },
    billing: {
      chargedTokens: Number(route.billing?.chargedTokens || 0) + Number(referenceResponse.billing?.chargedTokens || 0),
      creditsConsumed: Number(route.billing?.creditsConsumed || 0) + Number(referenceResponse.billing?.creditsConsumed || 0)
    }
  });
};

const attachAlternatives = (route, response) => ({
  ...route,
  routeAlternatives: response.routeAlternatives || response.route?.metadata?.routeAlternatives || [],
  selectedRouteAlternativeId: response.selectedRouteAlternativeId || response.route?.metadata?.selectedRouteAlternativeId || ''
});

const buildSelectedAipRoute = async ({ providerSource, providerResponse, departure, arrival, aircraftType, options, debugResponses, debug, authState } = {}) => {
  const normalized = normalizeRoute({
    ...providerResponse.route,
    departure,
    arrival,
    source: providerSource,
    sourceChain: [providerSource],
    fallbackUsed: false,
    debug,
    billing: providerResponse.billing || { chargedTokens: 0 }
  });
  const procedureResponse = await getBestProcedureResponse({
    departure,
    arrival,
    aircraftType,
    options,
    debugResponses,
    debug,
    authState
  });
  return attachAlternatives(
    buildRouteWithProcedures({ ...normalized, debug, fallbackUsed: false, source: providerSource }, procedureResponse),
    providerResponse
  );
};

export const generateUnifiedRoute = async ({
  departure,
  arrival,
  aircraftType = '',
  authState = 'guest',
  options = {},
  debugResponses = {}
} = {}) => {
  const offline = authState === 'offline' || options.offlineMode === true || isOfflineMode();
  if (offline) authState = 'offline';
  const installedAip = await loadInstalledAipPack();
  const cacheKey = buildRouteCacheKey({
    provider: 'route',
    departure,
    arrival,
    aircraftType,
    authState,
    options: {
      ...options,
      installedAip: installedAip ? [installedAip.id, installedAip.version, installedAip.installedAt] : null
    }
  });

  const cached = getCachedRoute(cacheKey, EXTERNAL_ROUTE_TTL_MS);
  const debug = createRouteDebugLog();
  if (cached && (!offline || [ROUTE_SOURCES.BUILT_IN, ROUTE_SOURCES.LOCAL_AIP].includes(cached.source))) {
    appendRouteDebug(debug, { provider: cached.source || ROUTE_SOURCES.BUILT_IN, status: PROVIDER_STATUS.CACHE_HIT, message: 'Route cache hit', cached: true });
    return { ...cached, debug, cached: true, billing: { chargedTokens: 0, creditsConsumed: 0 } };
  }

  const routeProviders = authState === 'authenticated' ? guardedRouteProviders : [];
  const aipProviderMode = offline ? AIP_PROVIDER_MODES.LOCAL_ONLY : options.aipProviderMode
    || options.localAip?.providerMode
    || options.supabaseAip?.providerMode
    || AIP_PROVIDER_MODES.LOCAL_ONLY;

  const tryLocalAip = async () => {
    const response = await searchLocalAipRouteAlternatives({
      departure,
      arrival,
      options: {
        ...(options.localAip || options),
        allowNetwork: !offline,
        limit: options.routeAlternativeLimit || options.localAip?.limit || 8
      }
    });

    if (response?.status === PROVIDER_STATUS.OK && response.route?.waypoints?.length) {
      appendRouteDebug(debug, {
        provider: ROUTE_SOURCES.LOCAL_AIP,
        status: PROVIDER_STATUS.OK,
        message: `Local AIP route alternatives found (${response.routeAlternatives?.length || 1})`,
        billing: response.billing || { chargedTokens: 0 }
      });
      return buildSelectedAipRoute({ providerSource: ROUTE_SOURCES.LOCAL_AIP, providerResponse: response, departure, arrival, aircraftType, options, debugResponses, debug, authState });
    }

    appendRouteDebug(debug, {
      provider: ROUTE_SOURCES.LOCAL_AIP,
      status: response?.status || PROVIDER_STATUS.UNAVAILABLE,
      message: response?.message || 'Local AIP route unavailable.',
      fallback: true,
      billing: response?.billing || { chargedTokens: 0 }
    });
    return null;
  };

  const trySupabaseAip = async () => {
    if (authState !== 'authenticated' || isOfflineMode()) return null;
    const response = await searchSupabaseAipRoute({
      departure,
      arrival,
      options: {
        ...(options.supabaseAip || options.localAip || options),
        limit: options.routeAlternativeLimit || options.supabaseAip?.limit || 5
      }
    });

    if (response?.status === PROVIDER_STATUS.OK && response.route?.waypoints?.length) {
      appendRouteDebug(debug, {
        provider: ROUTE_SOURCES.SUPABASE_AIP,
        status: PROVIDER_STATUS.OK,
        message: `Supabase AIP route found (${response.metrics?.method || 'indexed'})`,
        billing: response.billing || { chargedTokens: 0 }
      });
      return buildSelectedAipRoute({ providerSource: ROUTE_SOURCES.SUPABASE_AIP, providerResponse: response, departure, arrival, aircraftType, options, debugResponses, debug, authState });
    }

    appendRouteDebug(debug, {
      provider: ROUTE_SOURCES.SUPABASE_AIP,
      status: response?.status || PROVIDER_STATUS.UNAVAILABLE,
      message: response?.message || 'Supabase AIP route unavailable.',
      fallback: true,
      billing: response?.billing || { chargedTokens: 0 }
    });
    return null;
  };

  if ((installedAip || aipProviderMode !== AIP_PROVIDER_MODES.REMOTE_FIRST) && aipProviderMode !== AIP_PROVIDER_MODES.EXTERNAL_ONLY) {
    const localRoute = await tryLocalAip();
    if (localRoute) {
      setCachedRoute(cacheKey, localRoute);
      return localRoute;
    }
    if (aipProviderMode === AIP_PROVIDER_MODES.LOCAL_ONLY) {
      const builtIn = buildBuiltInRoute({ departure, arrival, debug });
      const fallback = { ...builtIn.route, debug, fallbackUsed: true, billing: { chargedTokens: 0, creditsConsumed: 0 } };
      setCachedRoute(cacheKey, fallback);
      return fallback;
    }
  }

  if (aipProviderMode !== AIP_PROVIDER_MODES.EXTERNAL_ONLY) {
    const supabaseRoute = await trySupabaseAip();
    if (supabaseRoute) {
      setCachedRoute(cacheKey, supabaseRoute);
      return supabaseRoute;
    }
  }

  if (!installedAip && aipProviderMode === AIP_PROVIDER_MODES.REMOTE_FIRST) {
    const localRoute = await tryLocalAip();
    if (localRoute) {
      setCachedRoute(cacheKey, localRoute);
      return localRoute;
    }
  }

  if (authState !== 'authenticated') {
    guardedRouteProviders.forEach((providerFn) => {
      const debugResponse = debugResponses[providerFn.name] || null;
      appendRouteDebug(debug, {
        provider: providerFn.name.replace('fetch', '').replace('Route', ''),
        status: debugResponse?.status || PROVIDER_STATUS.UNAUTHENTICATED,
        message: debugResponse?.message || 'Guarded provider skipped for unauthenticated route request.',
        fallback: true,
        billing: debugResponse?.billing || null
      });
    });
  }

  for (const providerFn of routeProviders) {
    const providerName = providerFn.name.replace('fetch', '').replace('Route', '');
    const providerResponse = await providerFn({
      departure,
      arrival,
      aircraftType,
      debugResponse: debugResponses[providerFn.name] || null
    });

    if (providerResponse?.status === PROVIDER_STATUS.OK && providerResponse.route) {
      const normalized = normalizeRoute({
        ...providerResponse.route,
        departure,
        arrival,
        source: providerResponse.route.source || providerName,
        sourceChain: [providerName],
        fallbackUsed: false,
        debug,
        billing: providerResponse.billing || null
      });
      appendRouteDebug(debug, { provider: providerName, status: PROVIDER_STATUS.OK, message: 'Route provider succeeded', billing: providerResponse.billing });
      const procedureResponse = await getBestProcedureResponse({
        departure,
        arrival,
        aircraftType,
      options,
      debugResponses,
      debug,
      authState
    });
      const finalRoute = buildRouteWithProcedures({ ...normalized, debug, fallbackUsed: false, source: normalized.source || providerName }, procedureResponse);
      setCachedRoute(cacheKey, finalRoute);
      return finalRoute;
    }

    appendRouteDebug(debug, {
      provider: providerName,
      status: providerResponse?.status || PROVIDER_STATUS.PROVIDER_FAILED,
      message: providerResponse?.message || 'Route provider unavailable',
      fallback: true,
      billing: providerResponse?.billing || null
    });
  }

  const builtIn = buildBuiltInRoute({ departure, arrival, debug });
  let routeAfterReference = builtIn.route;
  if (authState === 'authenticated') {
    const referenceResponse = await getNavaidReferencesAlongRoute({
      departure,
      arrival,
      debugResponse: debugResponses.getNavaidReferencesAlongRoute || null
    });
    if (referenceResponse?.status === PROVIDER_STATUS.OK && referenceResponse.navaids?.length) {
      appendRouteDebug(debug, { provider: ROUTE_SOURCES.AIRPORT_REFERENCE, status: PROVIDER_STATUS.OK, message: 'Reference navaids loaded for route corridor', billing: referenceResponse.billing });
      routeAfterReference = buildReferenceEnrichedRoute(builtIn.route, referenceResponse);
    } else {
      appendRouteDebug(debug, {
        provider: ROUTE_SOURCES.AIRPORT_REFERENCE,
        status: referenceResponse?.status || PROVIDER_STATUS.UNAVAILABLE,
        message: referenceResponse?.message || 'Reference navaids unavailable; trying OurAirports before synthetic fallback.',
        fallback: true,
        billing: referenceResponse?.billing || { chargedTokens: 0 }
      });

      const ourAirportsResponse = await getOurAirportsNavaidsAlongRoute({
        departure,
        arrival,
        debugResponse: debugResponses.getOurAirportsNavaidsAlongRoute || null
      });
      if (ourAirportsResponse?.status === PROVIDER_STATUS.OK && ourAirportsResponse.navaids?.length) {
        appendRouteDebug(debug, { provider: ROUTE_SOURCES.OUR_AIRPORTS, status: PROVIDER_STATUS.OK, message: 'OurAirports references loaded for route corridor', billing: ourAirportsResponse.billing });
        routeAfterReference = buildReferenceEnrichedRoute(builtIn.route, ourAirportsResponse);
      } else {
        appendRouteDebug(debug, {
          provider: ROUTE_SOURCES.OUR_AIRPORTS,
          status: ourAirportsResponse?.status || PROVIDER_STATUS.UNAVAILABLE,
          message: ourAirportsResponse?.message || 'OurAirports references unavailable; using synthetic fallback route.',
          fallback: true,
          billing: ourAirportsResponse?.billing || { chargedTokens: 0 }
        });
      }
    }
  }
  const chargedFallback = [...debug]
    .reverse()
    .find((entry) => Number(entry?.billing?.chargedTokens || 0) > 0 || Number(entry?.billing?.creditsConsumed || 0) > 0)?.billing || null;
  appendRouteDebug(debug, { provider: ROUTE_SOURCES.BUILT_IN, status: PROVIDER_STATUS.OK, message: routeAfterReference.source === ROUTE_SOURCES.AIRPORT_REFERENCE ? 'Using reference-enriched fallback' : 'Using built-in fallback', fallback: true, billing: routeAfterReference.billing || builtIn.route.billing });
  const finalRoute = {
    ...routeAfterReference,
    debug,
    fallbackUsed: true,
    billing: chargedFallback || routeAfterReference.billing || builtIn.route.billing,
    sourceChain: [...(routeAfterReference.sourceChain || builtIn.route.sourceChain || []), summarizeFallback(debug)]
  };
  setCachedRoute(cacheKey, finalRoute);
  return finalRoute;
};
