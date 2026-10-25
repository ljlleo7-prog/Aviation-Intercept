import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRadarDemand, setRadarNetworkAllowed } from '../src/services/radarDemand.js';
import { TerrainRadarService } from '../src/services/TerrainRadarService.js';
import { WeatherRadarService } from '../src/services/WeatherRadarService.js';
import { createElevationRequester } from '../src/services/elevationRequests.js';
import { DEFAULT_RADAR_PREFERENCES, normalizeRadarPreferences, writeRadarPreferences, readRadarPreferences } from '../src/utils/radarPreferences.js';

async function advance(context, milliseconds) {
  context.mock.timers.tick(milliseconds);
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function setup(context, fetchBatch, kind = 'terrain') {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  setRadarNetworkAllowed(true);
  writeRadarPreferences(DEFAULT_RADAR_PREFERENCES);
  const service = kind === 'terrain' ? new TerrainRadarService() : new WeatherRadarService();
  const demand = attachRadarDemand(service, kind, () => fetchBatch(service));
  context.after(() => { demand.dispose(); setRadarNetworkAllowed(true); writeRadarPreferences(DEFAULT_RADAR_PREFERENCES); });
  return service;
}

test('no demand makes zero requests; removing last view stops queued work', async context => {
  let requests = 0;
  const service = setup(context, () => { requests++; });
  await advance(context, 60000);
  assert.equal(requests, 0);
  service.setView('outside', [30, 120, 10, 0]);
  await advance(context, 1000);
  assert.equal(requests, 1);
  assert.ok(service.fetchQueue.length > 0);
  service.removeView('outside');
  await advance(context, 60000);
  assert.equal(requests, 1);
  assert.equal(service.fetchQueue.length, 0);
});

test('in-flight work is aborted and late results cannot populate terrain cache', async context => {
  let finish;
  const service = setup(context, radar => new Promise(resolve => {
    finish = () => { radar.processResults([{ key: 'late' }], [{ elevation: 100 }]); resolve(); };
  }));
  service.setView('outside', [30, 120, 10]);
  await advance(context, 1000);
  const signal = service.requestSignal;
  service.removeView('outside');
  assert.equal(signal.aborted, true);
  finish();
  await advance(context, 60000);
  assert.equal(service.cache.size, 0);
  assert.equal(service.fetchQueue.length, 0);
});

test('offline and hidden page pause fetching and resume existing demand', async context => {
  let requests = 0;
  const service = setup(context, () => { requests++; });
  const page = new EventTarget();
  page.hidden = false;
  const original = globalThis.document;
  globalThis.document = page;
  context.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  // Register another scheduler after installing the mock document listener.
  const demand = attachRadarDemand(service, 'terrain', () => { requests++; });
  context.after(() => demand.dispose());
  service.setView('view', [30, 120, 10]);
  setRadarNetworkAllowed(false);
  await advance(context, 10000);
  assert.equal(requests, 0);
  setRadarNetworkAllowed(true);
  await advance(context, 1000);
  assert.equal(requests, 1);
  page.hidden = true;
  page.dispatchEvent(new Event('visibilitychange'));
  await advance(context, 10000);
  assert.equal(requests, 1);
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  await advance(context, 1000);
  assert.equal(requests, 2);
});

test('multiple consumers merge unique cells and releasing one preserves the other', async context => {
  const service = setup(context, () => {});
  service.setView('left', [30, 120, 1]);
  service.setView('right', [31, 121, 1]);
  await advance(context, 1000);
  const leftKey = service.getKey(...Object.values(service.getGridIndices(30, 120)));
  const rightKey = service.getKey(...Object.values(service.getGridIndices(31, 121)));
  assert.ok(service.fetchQueue.some(item => item.key === leftKey));
  assert.ok(service.fetchQueue.some(item => item.key === rightKey));
  assert.equal(new Set(service.fetchQueue.map(item => item.key)).size, service.fetchQueue.length);
  service.removeView('left');
  await advance(context, 2000);
  assert.ok(service.fetchQueue.some(item => item.key === rightKey));
  assert.ok(!service.fetchQueue.some(item => item.key === leftKey));
});

test('settings change spacing, range and interval without mixing cached grids', async context => {
  let requests = 0;
  const service = setup(context, () => { requests++; });
  service.setView('view', [30, 120, 80]);
  await advance(context, 1000);
  const originalCount = service.fetchQueue.length;
  service.cache.set('old-grid', 999);
  writeRadarPreferences({ ...DEFAULT_RADAR_PREFERENCES, terrainSpacing: 0.02, terrainRange: 5, terrainInterval: 5 });
  await advance(context, 1000);
  assert.equal(service.GRID_SIZE, 0.02);
  assert.equal(service.cache.has('old-grid'), false);
  assert.ok(service.fetchQueue.length < originalCount / 4);
  assert.equal(requests, 1);
  await advance(context, 4000);
  assert.equal(requests, 2);
});

test('weather uses finer configurable sampling and stops after release', async context => {
  let requests = 0;
  const service = setup(context, () => { requests++; }, 'weather');
  service.setView('weather', [30, 120, 20]);
  await advance(context, 1000);
  const originalCount = service.fetchQueue.length;
  writeRadarPreferences({ ...DEFAULT_RADAR_PREFERENCES, weatherSpacing: 0.025 });
  await advance(context, 2000);
  assert.equal(service.GRID_SIZE, 0.025);
  assert.ok(service.fetchQueue.length > originalCount * 3);
  service.removeView('weather');
  await advance(context, 60000);
  assert.equal(requests, 2);
});

test('preferences reject invalid values and persist valid settings', context => {
  const storage = new Map();
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  context.after(() => { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; writeRadarPreferences(DEFAULT_RADAR_PREFERENCES); });
  assert.deepEqual(normalizeRadarPreferences({ terrainInterval: 0, weatherSpacing: NaN }), DEFAULT_RADAR_PREFERENCES);
  const saved = writeRadarPreferences({ ...DEFAULT_RADAR_PREFERENCES, weatherSpacing: 0.025 });
  assert.deepEqual(readRadarPreferences(), saved);
});

test('intentional cancellation does not create a 30-second provider failure cooldown', async () => {
  let now = 1000;
  const controller = new AbortController();
  const request = createElevationRequester({ now: () => now, fetchImpl: async (_url, options) => {
    if (options?.signal) { controller.abort(); throw controller.signal.reason; }
    return { ok: true, status: 200 };
  } });
  await assert.rejects(request('https://example.com/terrain', { signal: controller.signal }));
  now += 1000;
  assert.equal((await request('https://example.com/terrain')).status, 200);
});

test('terrain fallback uses its configured requester; deferred primary creates no fallback traffic', async context => {
  const urls = [];
  context.mock.method(globalThis, 'fetch', async url => {
    urls.push(url);
    return url.startsWith('https://api.open-elevation.com/')
      ? { ok: false, status: 429, headers: { get: () => '60' } }
      : { ok: true, status: 200, json: async () => ({ results: [{ elevation: 100 }] }) };
  });
  const service = new TerrainRadarService({ requestElevation: createElevationRequester() });
  await service.fetchElevationData([{ key: 'first', lat: 30, lon: 120 }]);
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).origin, 'https://api.opentopodata.org');
  assert.equal(service.cache.get('first'), 328.084);
  await service.fetchElevationData([{ key: 'second', lat: 31, lon: 121 }]);
  assert.equal(urls.length, 2);
  assert.equal(service.cache.has('second'), false);
});

test('weather rejects unknown samples and expires valid samples after five minutes', async context => {
  const service = new WeatherRadarService({ requestWeather: createElevationRequester() });
  const item = { key: service.getKey(600, 2400), lat: 30.025, lon: 120.025 };
  let valid = false;
  context.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({ current: valid
    ? { cloud_cover: 80, precipitation: 2 } : { cloud_cover: null, precipitation: null } }) }));
  context.mock.timers.enable({ apis: ['Date'], now: 100000 });
  await service._fetchTile(item);
  assert.equal(service.cache.size, 0);
  context.mock.timers.tick(1000);
  valid = true;
  await service._fetchTile(item);
  assert.equal(service.getWeather(item.lat, item.lon).precip, 2);
  context.mock.timers.tick(300001);
  assert.equal(service.getWeather(item.lat, item.lon), null);
});
