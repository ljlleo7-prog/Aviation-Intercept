import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';

let networkCalls = 0;
let sessionUser = { id: 'signed-in' };
globalThis.__mockCreateClient = () => ({
  auth: { getSession: async () => ({ data: { session: sessionUser ? { user: sessionUser } : null } }) },
  functions: { invoke: async () => { networkCalls++; throw new Error('No external API calls allowed'); } },
  rpc: async () => { networkCalls++; throw new Error('No cloud AIP calls allowed'); }
});
const { generateUnifiedRoute } = await import('../src/services/routes/routeService.js');
const { loadLocalAipCsvStore, resetLocalAipCsvStore } = await import('../src/services/routes/aipCsvDataStore.js');
const { preloadLocalAipData } = await import('../src/services/routes/aipPreload.js');
const { saveAipPack, removeAipPack } = await import('../src/services/aipPackStorage.js');
const { airportService } = await import('../src/services/airportService.js');
const { callGuardedRouteProvider } = await import('../src/services/routes/routeProviderGateway.js');
const { callAipRpc } = await import('../src/services/aipRpcClient.js');
const { setOnlineMode } = await import('../src/utils/appNetworkMode.js');

const departure = { icao: 'TEST', latitude: 0, longitude: 0 };
const arrival = { icao: 'DEST', latitude: 0, longitude: 2 };
const pack = () => ({ id: 'world-aip', version: 'offline', installedAt: 'offline', navaids: [],
  airports: [{ icao: 'TEST', name: 'Imported airport', latitude: 0, longitude: 0, runways: [] }], files: {
    'aip_route_lookup_index.csv': 'region_code,aip_cycle,departure_code,arrival_code,route_id,route_code,lookup_rank\nXX,2605,TEST,DEST,R1,TEST-DEST,1',
    'aip_route_legs.csv': 'route_id,leg_sequence,from_fix,airway,to_fix,region_code,aip_cycle\nR1,1,TEST,A1,PACKFIX,XX,2605\nR1,2,PACKFIX,A1,DEST,XX,2605',
    'aip_reference_points.csv': 'point_id,region_code,aip_cycle,ident,point_type,name,latitude_deg,longitude_deg\n1,XX,2605,TEST,airport,TEST,0,0\n2,XX,2605,PACKFIX,waypoint,PACKFIX,0,1\n3,XX,2605,DEST,airport,DEST,0,2',
    'aip_route_edge_index.csv': 'region_code,aip_cycle,from_fix,to_fix,airway,route_id,route_code,leg_sequence'
  } });

test('offline searches use imported packs or bundled assets/fallback without provider API dispatch', async context => {
  globalThis.indexedDB = indexedDB;
  const storage = new Map([['app_settings', JSON.stringify({ offlineMode: true })]]);
  globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  let assetReads = 0;
  context.mock.method(globalThis, 'fetch', async url => {
    if (String(url).startsWith('/AIP_DATA/supabase_csv/')) { assetReads++; return { ok: false, status: 404 }; }
    networkCalls++; throw new Error('Offline route search must never fetch providers');
  });
  setOnlineMode(false);
  context.after(() => { delete globalThis.indexedDB; delete globalThis.window; setOnlineMode(true); });
  await removeAipPack(); resetLocalAipCsvStore();
  assert.equal(await preloadLocalAipData(), false);
  const fallback = await generateUnifiedRoute({ departure, arrival, authState: 'authenticated', options: { aipProviderMode: 'remote-first' } });
  assert.equal(fallback.source, 'Built-in');
  assert.equal(fallback.billing.chargedTokens, 0);
  assert.equal(fallback.billing.creditsConsumed, 0);
  assert.equal((await callGuardedRouteProvider({ provider: 'OurAirports' })).status, 'unavailable');
  assert.equal((await callAipRpc('skylinetragedy_search_airports', {})).status, 'unavailable');
  assert.ok((await airportService.searchAirportsRemote('Hong')).length > 0);
  assert.ok(await airportService.getAirportByCodeRemote('VHHH'));
  assert.ok((await airportService.getAirportsWithinRadiusRemote(22.3, 113.9, 100)).length > 0);
  assert.equal(networkCalls, 0);
  assert.ok(assetReads > 0);

  await saveAipPack(pack()); resetLocalAipCsvStore();
  const readsBeforeImport = assetReads;
  const imported = await generateUnifiedRoute({ departure, arrival, authState: 'authenticated', options: { aipProviderMode: 'external-only' } });
  assert.equal(imported.source, 'LocalAIP');
  assert.ok(imported.waypoints.some(point => (point.name || point.label) === 'PACKFIX'));
  assert.equal((await airportService.getAirportByCodeRemote('TEST')).name, 'Imported airport');
  assert.equal(networkCalls, 0);
  assert.equal(assetReads, readsBeforeImport);

  // Missing imported files may use free bundled assets, never remote providers.
  const incomplete = pack(); delete incomplete.files['aip_route_legs.csv'];
  await saveAipPack(incomplete); resetLocalAipCsvStore();
  await assert.rejects(loadLocalAipCsvStore(), /Failed to load/);
  await assert.rejects(loadLocalAipCsvStore({ csvDir: 'https://external.test/AIP_DATA/supabase_csv' }), /unavailable offline/);
  assert.equal(networkCalls, 0);
  await removeAipPack(); resetLocalAipCsvStore();
  assert.equal(await airportService.getAirportByCodeRemote('TEST'), null);
});

test('explicit offline auth overrides external provider preferences without browser storage', async context => {
  setOnlineMode(true);
  context.mock.method(globalThis, 'fetch', async url => {
    if (String(url).startsWith('/AIP_DATA/supabase_csv/')) return { ok: false, status: 404 };
    networkCalls++; throw new Error('Must not fetch providers');
  });
  const before = networkCalls;
  const route = await generateUnifiedRoute({ departure, arrival, authState: 'offline', options: { aipProviderMode: 'external-only' } });
  assert.equal(route.source, 'Built-in');
  assert.equal(networkCalls, before);
});

test('free bundled AIP routes remain available offline and signed-out while API calls stay blocked', async context => {
  const storage = new Map([['app_settings', JSON.stringify({ offlineMode: true })]]);
  globalThis.window = { location: { origin: 'https://app.test' }, localStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)
  } };
  context.after(() => { delete globalThis.window; sessionUser = { id: 'signed-in' }; setOnlineMode(true); });
  const files = pack().files;
  let assetReads = 0;
  context.mock.method(globalThis, 'fetch', async url => {
    assert.ok(String(url).startsWith('/AIP_DATA/supabase_csv/'));
    assetReads++;
    return new Response(files[String(url).split('/').at(-1)]);
  });
  setOnlineMode(false); resetLocalAipCsvStore();
  const before = networkCalls;
  const route = await generateUnifiedRoute({ departure, arrival, authState: 'offline' });
  assert.equal(route.source, 'LocalAIP');
  assert.ok(route.waypoints.some(point => (point.name || point.label) === 'PACKFIX'));
  assert.equal(assetReads, 4);
  assert.equal(networkCalls, before);
  storage.set('app_settings', JSON.stringify({ offlineMode: false }));
  setOnlineMode(true); sessionUser = null;
  assert.equal((await callGuardedRouteProvider({ provider: 'OurAirports' })).status, 'unauthenticated');
  assert.equal((await callAipRpc('skylinetragedy_search_airports', {})).status, 'unauthenticated');
  assert.equal(networkCalls, before);
});
