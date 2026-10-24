import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProviderNegativeCacheKey,
  buildReferenceCacheKey,
  buildRouteCacheKey,
  getCachedProviderNegative,
  getCachedRoute,
  getCachedReferenceData,
  REFERENCE_CACHE_MAX_ENTRIES,
  ROUTE_CACHE_MAX_ENTRIES,
  setCachedProviderNegative,
  setCachedReferenceData,
  setCachedRoute
} from '../src/services/routes/routeCacheService.js';
import { PROVIDER_STATUS } from '../src/services/routes/routeTypes.js';

const KLAX = { icao: 'KLAX', iata: 'LAX', name: 'Los Angeles Intl', latitude: 33.9425, longitude: -118.4081 };
const EGLL = { icao: 'EGLL', iata: 'LHR', name: 'London Heathrow', latitude: 51.47, longitude: -0.4543 };

const createStorage = () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
    key: (index) => Array.from(store.keys())[index] ?? null
  };

  Object.defineProperty(storage, 'length', {
    get() {
      return store.size;
    }
  });

  return { store, storage };
};

test.beforeEach(() => {
  delete globalThis.window;
});

test('buildRouteCacheKey keeps auth state separated', () => {
  const guestKey = buildRouteCacheKey({ departure: KLAX, arrival: EGLL, authState: 'guest' });
  const authKey = buildRouteCacheKey({ departure: KLAX, arrival: EGLL, authState: 'authenticated' });

  assert.notEqual(guestKey, authKey);
  assert.ok(guestKey.includes(':guest:'));
  assert.ok(authKey.includes(':authenticated:'));
});

test('bounded route cache evicts oldest entries after the limit', () => {
  const { store, storage } = createStorage();
  globalThis.window = { localStorage: storage };

  for (let index = 0; index < ROUTE_CACHE_MAX_ENTRIES + 3; index += 1) {
    setCachedRoute(`ultimate-crash:routes:test:${index}`, { source: 'Built-in', id: index, status: PROVIDER_STATUS.OK });
  }

  assert.ok(store.size <= ROUTE_CACHE_MAX_ENTRIES);
});

test('negative provider cache stores retryable failures briefly', () => {
  const { storage } = createStorage();
  globalThis.window = { localStorage: storage };

  const key = buildProviderNegativeCacheKey({ provider: 'FlightPlanDB', payload: { origin: 'KLAX', destination: 'EGLL' } });
  setCachedProviderNegative(key, { status: PROVIDER_STATUS.RATE_LIMITED, message: 'Too many calls' });

  const cached = getCachedProviderNegative(key);
  assert.equal(cached.status, PROVIDER_STATUS.RATE_LIMITED);
  assert.equal(cached.message, 'Too many calls');
});

test('reference cache stores trimmed regional airport data', () => {
  const { storage } = createStorage();
  globalThis.window = { localStorage: storage };

  const key = buildReferenceCacheKey({ type: 'airport', airport: KLAX, query: 'LAX' });
  setCachedReferenceData(key, {
    airport: { ...KLAX, openAipReference: { id: 'abc', name: 'Los Angeles', latitude: 33.95, longitude: -118.4, extra: 'discard me' } },
    references: [
      { id: 'abc', name: 'Los Angeles', latitude: 33.95, longitude: -118.4, extra: 'discard me' },
      { id: 'def', name: 'Nearby', latitude: 34, longitude: -118 }
    ],
    source: 'openaip',
    billing: { chargedTokens: 1 },
    status: 'ok'
  });

  const cached = getCachedReferenceData(key, 60 * 60 * 1000);
  assert.equal(cached.source, 'openaip');
  assert.equal(cached.references.length, 2);
  assert.equal(cached.airport.openAipReference.extra, undefined);
});

test('reference cache stores compact airport and navaid lists', () => {
  const { storage } = createStorage();
  globalThis.window = { localStorage: storage };

  const key = buildReferenceCacheKey({ type: 'nearby-airports', latitude: 51.47, longitude: -0.45, radiusNm: 120 });
  setCachedReferenceData(key, {
    airports: [{ icao: 'EGLL', iata: 'LHR', name: 'Heathrow', latitude: 51.47, longitude: -0.45, runways: Array.from({ length: 12 }, (_v, i) => ({ name: `RWY${i}` })) }],
    navaids: [{ identifier: 'LAM', name: 'LAMBOURNE', latitude: 51.65, longitude: 0.15 }],
    billing: { chargedTokens: 1 },
    source: 'AirportReference'
  });

  const cached = getCachedReferenceData(key, 60 * 60 * 1000);
  assert.equal(cached.airports[0].icaoCode, 'EGLL');
  assert.equal(cached.airports[0].runways.length, 8);
  assert.equal(cached.navaids[0].identifier, 'LAM');
});

test('reference cache evicts oldest regional entries after the limit', () => {
  const { store, storage } = createStorage();
  globalThis.window = { localStorage: storage };

  for (let index = 0; index < REFERENCE_CACHE_MAX_ENTRIES + 4; index += 1) {
    setCachedReferenceData(`ultimate-crash:route-references:test:${index}`, {
      airport: { ...KLAX, icao: `K${index}` },
      references: [{ id: index, name: `Airport ${index}`, latitude: 30 + index, longitude: -100 - index }],
      source: 'openaip',
      billing: { chargedTokens: 1 },
      status: 'ok'
    });
  }

  assert.ok(store.size <= REFERENCE_CACHE_MAX_ENTRIES);
});

test('quota recovery evicts only routing caches and preserves saves and settings', () => {
  const { store, storage } = createStorage();
  globalThis.window = { localStorage: storage };
  store.set('flight-save', 'keep my flight');
  store.set('settings', 'keep my settings');
  store.set('ultimate-crash:routes:old', JSON.stringify({ timestamp: 1, route: { data: 'x'.repeat(300) } }));
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    const size = [...store].filter(([existing]) => existing !== key).reduce((sum, [k, v]) => sum + k.length + v.length, 0) + key.length + value.length;
    if (size > 500) throw new DOMException('Full', 'QuotaExceededError');
    write(key, value);
  };
  const key = 'ultimate-crash:routes:new';
  assert.doesNotThrow(() => setCachedRoute(key, { source: 'LocalAIP', data: 'y'.repeat(150) }));
  assert.equal(getCachedRoute(key, 60000).source, 'LocalAIP');
  assert.equal(store.has('ultimate-crash:routes:old'), false);
  assert.equal(store.get('flight-save'), 'keep my flight');
  assert.equal(store.get('settings'), 'keep my settings');
});

test('permanently full storage cannot break cache writes or valid cache reads', () => {
  const { store, storage } = createStorage();
  globalThis.window = { localStorage: storage };
  const key = 'ultimate-crash:routes:valid';
  store.set(key, JSON.stringify({ timestamp: Date.now(), route: { id: 'cached' } }));
  storage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  assert.equal(getCachedRoute(key, 60000).id, 'cached');
  assert.doesNotThrow(() => setCachedRoute('ultimate-crash:routes:new', { id: 'new' }));
});

test('oversized diagnostics skip persistence without evicting existing entries', () => {
  const { store, storage } = createStorage();
  globalThis.window = { localStorage: storage };
  setCachedRoute('ultimate-crash:routes:small', { id: 'small' });
  setCachedRoute('ultimate-crash:routes:huge', { debug: 'x'.repeat(300000) });
  assert.equal(store.size, 1);
  assert.equal(getCachedRoute('ultimate-crash:routes:small', 60000).id, 'small');
});

test('unavailable browser storage degrades to uncached operation', () => {
  globalThis.window = { get localStorage() { throw new DOMException('Blocked', 'SecurityError'); } };
  assert.doesNotThrow(() => setCachedRoute('test', { id: 'new' }));
  assert.equal(getCachedRoute('test', 60000), null);
});
