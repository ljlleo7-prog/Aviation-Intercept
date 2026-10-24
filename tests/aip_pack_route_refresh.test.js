import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { loadInstalledAipPack, saveAipPack, removeAipPack } from '../src/services/aipPackStorage.js';
import { loadLocalAipCsvStore } from '../src/services/routes/aipCsvDataStore.js';
import { generateUnifiedRoute } from '../src/services/routes/routeService.js';
import { buildRouteCacheKey, setCachedRoute } from '../src/services/routes/routeCacheService.js';

const departure = { icao: 'TEST', latitude: 0, longitude: 0 };
const arrival = { icao: 'DEST', latitude: 0, longitude: 2 };
const makePack = fix => ({ id: 'world-aip', version: fix, installedAt: fix, airports: [], navaids: [], files: {
  'aip_route_lookup_index.csv': 'region_code,aip_cycle,departure_code,arrival_code,route_id,route_code,lookup_rank\nXX,2605,TEST,DEST,R1,TEST-DEST,1',
  'aip_route_legs.csv': `route_id,leg_sequence,from_fix,airway,to_fix,region_code,aip_cycle\nR1,1,TEST,A1,${fix},XX,2605\nR1,2,${fix},A1,DEST,XX,2605`,
  'aip_reference_points.csv': `point_id,region_code,aip_cycle,ident,point_type,name,latitude_deg,longitude_deg\n1,XX,2605,TEST,airport,TEST,0,0\n2,XX,2605,${fix},waypoint,${fix},0,1\n3,XX,2605,DEST,airport,DEST,0,2`,
  'aip_route_edge_index.csv': 'region_code,aip_cycle,from_fix,to_fix,airway,route_id,route_code,leg_sequence'
} });

test('imported packs supersede cached fallback routes and refresh airway indexes without reload', async () => {
  globalThis.indexedDB = indexedDB;
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Offline: network must not be used'); };
  try {
    assert.equal(await loadInstalledAipPack(), null);
    setCachedRoute(buildRouteCacheKey({ departure, arrival }), { source: 'built-in', waypoints: [], fallbackUsed: true });
    await saveAipPack(makePack('ACTUAL'));
    assert.equal((await loadInstalledAipPack()).version, 'ACTUAL');
    await loadLocalAipCsvStore();
    const route = await generateUnifiedRoute({ departure, arrival });
    assert.equal(route.fallbackUsed, false);
    assert.ok(route.waypoints.some(point => (point.name || point.label) === 'ACTUAL'));
    await saveAipPack(makePack('NEWFIX'));
    const next = await generateUnifiedRoute({ departure, arrival });
    assert.ok(next.waypoints.some(point => (point.name || point.label) === 'NEWFIX'));
    assert.ok(!next.waypoints.some(point => (point.name || point.label) === 'ACTUAL'));
    await saveAipPack(makePack('FULL'));
    window.localStorage.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    const uncached = await generateUnifiedRoute({ departure, arrival });
    assert.equal(uncached.fallbackUsed, false);
    assert.ok(uncached.waypoints.some(point => (point.name || point.label) === 'FULL'));
    await removeAipPack();
    assert.equal(await loadInstalledAipPack(), null);
  } finally {
    globalThis.fetch = fetchOriginal;
    delete globalThis.window;
    delete globalThis.indexedDB;
  }
});
