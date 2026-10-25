import test from 'node:test';
import assert from 'node:assert/strict';
import { createElevationRequester } from '../src/services/elevationRequests.js';
import { TerrainRadarService } from '../src/services/TerrainRadarService.js';

const url = 'https://api.open-elevation.com/api/v1/lookup?locations=0,0';

test('shared provider gate prevents overlapping and too-frequent requests', async () => {
  let time = 1000;
  let calls = 0;
  let complete;
  const request = createElevationRequester({ now: () => time, fetchImpl: () => {
    calls++;
    return new Promise(resolve => { complete = resolve; });
  } });
  const pending = request(url);
  time = 3000;
  assert.equal(await request(url + '|1,1'), null);
  assert.equal(calls, 1);
  complete({ ok: true, status: 200 });
  await pending;
  const second = request(url);
  complete({ ok: true, status: 200 });
  await second;
  assert.equal(await request(url), null);
  assert.equal(calls, 2);
});

test('429 honors Retry-After and allows improved data after cooldown', async () => {
  let time = 1000;
  let calls = 0;
  const request = createElevationRequester({ now: () => time, fetchImpl: async () => {
    calls++;
    return calls === 1
      ? { ok: false, status: 429, headers: { get: () => '120' } }
      : { ok: true, status: 200 };
  } });
  assert.equal((await request(url)).status, 429);
  time += 119999;
  assert.equal(await request(url), null);
  time++;
  assert.equal((await request(url)).status, 200);
  assert.equal(calls, 2);
});

test('network failures back off without permanently suppressing retry', async () => {
  let time = 1000;
  let calls = 0;
  const request = createElevationRequester({ now: () => time, fetchImpl: async () => {
    if (++calls === 1) throw new Error('offline');
    return { ok: true, status: 200 };
  } });
  await assert.rejects(request(url), /offline/);
  time += 29999;
  assert.equal(await request(url), null);
  time++;
  assert.equal((await request(url)).status, 200);
});

test('radar excludes in-flight cells and drops cached cells before dispatch', async () => {
  const service = new TerrainRadarService();
  service.update(31.64, 121.65, 1);
  let complete;
  let requested;
  service.fetchElevationData = batch => {
    requested = batch;
    return new Promise(resolve => { complete = () => {
      batch.forEach(item => service.cache.set(item.key, 123)); resolve();
    }; });
  };
  const pending = service.fetchNextBatch();
  service.update(31.64, 121.65, 1);
  assert.ok(requested.every(item => !service.fetchQueue.some(queued => queued.key === item.key)));
  await service.fetchNextBatch(); // No overlapping dispatch.
  complete();
  await pending;
  assert.equal(service.inFlightKeys.size, 0);
  service.fetchQueue = [...requested]; // Simulate an older queue snapshot.
  let calls = 0;
  service.fetchElevationData = async () => { calls++; };
  await service.fetchNextBatch();
  assert.equal(calls, 0);
});

test('deferred terrain remains pending, retries successfully, and fetcher starts once', async () => {
  const service = new TerrainRadarService();
  service.update(0, 0, 0);
  service.fetchElevationData = async () => {};
  await service.fetchNextBatch();
  assert.equal(service.cache.size, 0);
  assert.equal(service.fetchQueue.length, 1);
  service.fetchElevationData = async batch => batch.forEach(item => service.cache.set(item.key, 500));
  await service.fetchNextBatch();
  assert.equal(service.getTerrainHeight(0, 0), 500);
  let calls = 0;
  service.fetchNextBatch = async () => { calls++; };
  service.startFetcher(); service.startFetcher(); service.stopFetcher();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(service.fetchTimer, null);
});

test('ground elevation defers during shared provider cooldown without caching sea level', async () => {
  const { TerrainService } = await import('../src/services/TerrainService.js');
  const requestElevation = createElevationRequester();
  const service = new TerrainService({ requestElevation });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false, status: 429, headers: { get: () => '60' } };
  };
  try {
    assert.equal(await service.getElevation(31.64, 121.65), null);
    assert.equal(service.cache.size, 0);
    const secondConsumer = new TerrainService({ requestElevation });
    assert.equal(await secondConsumer.getElevation(31.65, 121.66), null);
    assert.equal(calls, 1);
    assert.equal(secondConsumer.cache.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unknown radar samples stay eligible for refinement while true sea level is cached', () => {
  const service = new TerrainRadarService();
  const batch = [{ key: 'unknown' }, { key: 'sea' }];
  service.processResults(batch, [{ elevation: null }, { elevation: 0 }]);
  assert.equal(service.cache.has('unknown'), false);
  assert.equal(service.cache.get('sea'), 0);
  service.processResults(batch, [{ elevation: 100 }]);
  assert.equal(service.cache.get('unknown'), 328.084);
});
