import { PROVIDER_STATUS, ROUTE_CACHE_VERSION } from './routeTypes.js';

const ROUTE_CACHE_PREFIX = 'ultimate-crash:routes:';
const REFERENCE_CACHE_PREFIX = 'ultimate-crash:route-references:';
const NEGATIVE_CACHE_PREFIX = 'ultimate-crash:route-negative:';

export const ROUTE_CACHE_MAX_ENTRIES = 24;
export const REFERENCE_CACHE_MAX_ENTRIES = 36;
export const NEGATIVE_ROUTE_TTL_MS = 60 * 1000;

const hasLocalStorage = () => {
  try { return typeof window !== 'undefined' && Boolean(window.localStorage); }
  catch { return false; }
};
const isManagedKey = key => [ROUTE_CACHE_PREFIX, REFERENCE_CACHE_PREFIX, NEGATIVE_CACHE_PREFIX].some(prefix => key.startsWith(prefix));
// Avoid persisting large diagnostic payloads in browser storage.
const MAX_CACHE_ENTRY_CHARS = 256 * 1024;

const safeJsonParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

const getStorageKeys = () => {
  if (!hasLocalStorage()) return [];
  const storage = window.localStorage;
  if (typeof storage.length === 'number' && typeof storage.key === 'function') {
    return Array.from({ length: storage.length }, (_value, index) => storage.key(index)).filter(Boolean);
  }
  return Object.keys(storage);
};

const getEntry = (key, ttlMs, valueKey) => {
  if (!hasLocalStorage() || !key) return null;
  try {
    const entry = safeJsonParse(window.localStorage.getItem(key));
    if (!entry?.timestamp || !Object.prototype.hasOwnProperty.call(entry, valueKey)) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    // A failed LRU touch must not turn a valid cached route into a failure.
    try { window.localStorage.setItem(key, JSON.stringify({ ...entry, lastAccessed: Date.now() })); }
    catch { /* Cache reads remain useful when storage is full or read-only. */ }
    return entry[valueKey];
  } catch {
    return null;
  }
};

const pruneCache = (prefix, maxEntries) => {
  if (!hasLocalStorage()) return;
  const entries = getStorageKeys()
    .filter((key) => key.startsWith(prefix))
    .map((key) => ({ key, entry: safeJsonParse(window.localStorage.getItem(key)) }))
    .filter(({ entry }) => entry?.timestamp);

  if (entries.length <= maxEntries) return;

  entries
    .sort((a, b) => (a.entry.lastAccessed || a.entry.timestamp) - (b.entry.lastAccessed || b.entry.timestamp))
    .slice(0, entries.length - maxEntries)
    .forEach(({ key }) => window.localStorage.removeItem(key));
};

const setEntry = (key, valueKey, value, prefix, maxEntries) => {
  if (!hasLocalStorage() || !key || value == null) return;
  try {
    const serialized = JSON.stringify({ timestamp: Date.now(), lastAccessed: Date.now(), [valueKey]: value });
    if (serialized.length > MAX_CACHE_ENTRY_CHARS) return;
    // Make room before writing; pruning afterwards is too late when already full.
    pruneCache(prefix, maxEntries - (window.localStorage.getItem(key) === null ? 1 : 0));
    try { window.localStorage.setItem(key, serialized); return; }
    catch (error) {
      if (!['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name) && error?.code !== 22) return;
    }
    const entries = getStorageKeys().filter(isManagedKey).map(cacheKey => {
      const entry = safeJsonParse(window.localStorage.getItem(cacheKey));
      return { key: cacheKey, accessed: entry?.lastAccessed || entry?.timestamp || 0 };
    }).sort((a, b) => a.accessed - b.accessed);
    for (const entry of entries) {
      window.localStorage.removeItem(entry.key);
      try { window.localStorage.setItem(key, serialized); return; }
      catch (error) {
        if (!['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name) && error?.code !== 22) return;
      }
    }
  } catch {
    // Caching is optional. Storage/serialization errors must never abort route creation.
  }
};

const sanitizeReference = (reference = {}) => ({
  id: reference.id || null,
  type: reference.type || '',
  name: reference.name || '',
  identifier: reference.identifier || '',
  icaoCode: reference.icaoCode || reference.icao || '',
  iataCode: reference.iataCode || reference.iata || '',
  city: reference.city || '',
  country: reference.country || '',
  elevation: reference.elevation ?? null,
  latitude: typeof reference.latitude === 'number' ? reference.latitude : Number(reference.latitude) || 0,
  longitude: typeof reference.longitude === 'number' ? reference.longitude : Number(reference.longitude) || 0,
  runways: Array.isArray(reference.runways) ? reference.runways.slice(0, 8) : [],
  frequencies: Array.isArray(reference.frequencies) ? reference.frequencies.slice(0, 8) : [],
  source: reference.source || ''
});

export const buildRouteCacheKey = ({ provider = 'route', departure, arrival, aircraftType = '', authState = 'guest', options = {} } = {}) => {
  const dep = departure?.icao || departure?.iata || departure?.airport || 'DEP';
  const arr = arrival?.icao || arrival?.iata || arrival?.airport || 'ARR';
  const optionKey = JSON.stringify({
    aircraftType,
    includeSidStar: options.includeSidStar !== false,
    routeVersion: ROUTE_CACHE_VERSION,
    installedAip: options.installedAip || null,
    aipProviderMode: options.aipProviderMode || options.localAip?.providerMode || options.supabaseAip?.providerMode || 'local-only',
    localAip: options.localAip || null
  });
  return `${ROUTE_CACHE_PREFIX}${provider}:${dep}:${arr}:${authState}:${optionKey}`;
};

export const buildProviderNegativeCacheKey = ({ provider = 'route', payload = {}, authState = 'authenticated' } = {}) => {
  const payloadKey = JSON.stringify({
    origin: payload.origin || '',
    destination: payload.destination || '',
    query: payload.query || '',
    type: payload.type || '',
    aircraftType: payload.aircraftType || ''
  });
  return `${NEGATIVE_CACHE_PREFIX}${provider}:${authState}:${payloadKey}`;
};

export const buildReferenceCacheKey = ({ type = 'airport', airport, query = '', latitude = null, longitude = null, radiusNm = null } = {}) => {
  const latValue = Number(airport?.latitude ?? latitude);
  const lonValue = Number(airport?.longitude ?? longitude);
  const latBucket = Number.isFinite(latValue) ? Math.round(latValue / 2) * 2 : 'unknown';
  const lonBucket = Number.isFinite(lonValue) ? Math.round(lonValue / 2) * 2 : 'unknown';
  const code = airport?.icao || airport?.iata || query || 'reference';
  const radius = radiusNm ? `:${Math.round(Number(radiusNm) || 0)}` : '';
  return `${REFERENCE_CACHE_PREFIX}${type}:${latBucket}:${lonBucket}:${String(code).toUpperCase()}${radius}`;
};

export const getCachedRoute = (key, ttlMs) => getEntry(key, ttlMs, 'route');

export const setCachedRoute = (key, route) => {
  if (route?.status && route.status !== PROVIDER_STATUS.OK) return;
  setEntry(key, 'route', route, ROUTE_CACHE_PREFIX, ROUTE_CACHE_MAX_ENTRIES);
};

export const getCachedProviderNegative = (key) => getEntry(key, NEGATIVE_ROUTE_TTL_MS, 'response');

export const setCachedProviderNegative = (key, response) => {
  if (![PROVIDER_STATUS.RATE_LIMITED, PROVIDER_STATUS.PROVIDER_FAILED, PROVIDER_STATUS.UNAVAILABLE].includes(response?.status)) return;
  setEntry(key, 'response', {
    status: response.status,
    message: response.message || 'Cached provider failure. Falling back locally.',
    billing: response.billing || { chargedTokens: 0 }
  }, NEGATIVE_CACHE_PREFIX, ROUTE_CACHE_MAX_ENTRIES);
};

export const getCachedReferenceData = (key, ttlMs) => getEntry(key, ttlMs, 'referenceData');

export const setCachedReferenceData = (key, referenceData) => {
  if (!referenceData) return;
  setEntry(key, 'referenceData', {
    ...referenceData,
    airport: referenceData.airport ? {
      ...referenceData.airport,
      openAipReference: referenceData.airport.openAipReference ? sanitizeReference(referenceData.airport.openAipReference) : undefined
    } : null,
    references: (referenceData.references || []).slice(0, 10).map(sanitizeReference),
    airports: (referenceData.airports || []).slice(0, 20).map(sanitizeReference),
    navaids: (referenceData.navaids || []).slice(0, 40).map(sanitizeReference)
  }, REFERENCE_CACHE_PREFIX, REFERENCE_CACHE_MAX_ENTRIES);
};

export const clearRouteCache = () => {
  if (!hasLocalStorage()) return;
  try {
    getStorageKeys().filter(isManagedKey).forEach(key => window.localStorage.removeItem(key));
  } catch { /* Browser storage may be disabled. */ }
};
