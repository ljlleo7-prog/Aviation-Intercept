import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB } from 'fake-indexeddb';
import { unzipSync, zipSync, strToU8 } from 'fflate';
import { parseAipPack, importAipPack, AIP_SOURCE_FILES } from '../src/services/aipPackImport.js';
import { listAipPacks, readAipPack, removeAipPack } from '../src/services/aipPackStorage.js';
import { queryInstalledAip } from '../src/services/localAipData.js';
import { loadLocalAipCsvStore } from '../src/services/routes/aipCsvDataStore.js';
import { parseCsv } from '../src/utils/csv.js';

globalThis.indexedDB = indexedDB;
const bytes = new Uint8Array(await readFile(new URL('../aip-packs/world-aip-1.1.0.zip', import.meta.url)));

test('CSV parsing preserves quoted commas, quotes and newlines', () => {
  assert.deepEqual(parseCsv('\uFEFFname,city\r\n"A, ""B""","Line\nTwo"\r\n'), [{ name: 'A, "B"', city: 'Line\nTwo' }]);
  assert.throws(() => parseCsv('name\n"unclosed'));
});

test('bundle preserves every Supabase source table without dropping columns or rows', async () => {
  const files = unzipSync(bytes);
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  assert.equal(AIP_SOURCE_FILES.length, 13);
  for (const name of AIP_SOURCE_FILES) {
    let source;
    try { source = new Uint8Array(await readFile(new URL(`../aip-packs/source-overrides/${name}`, import.meta.url))); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      source = new Uint8Array(await readFile(new URL(`../AIP_DATA/supabase_csv/${name}`, import.meta.url)));
    }
    assert.deepEqual(files[name], source, name);
    assert.equal(manifest.sourceTables[name].rows, parseCsv(new TextDecoder().decode(source)).length, name);
  }
});

test('AIP import rejects corruption, missing route files and unexpected entries', async () => {
  const files = unzipSync(bytes);
  files['airports.json'] = strToU8('[]');
  await assert.rejects(parseAipPack(zipSync(files)), /checksum/);
  const missing = unzipSync(bytes);
  delete missing['aip_route_legs.csv'];
  await assert.rejects(parseAipPack(zipSync(missing)), /Missing AIP/);
  const extra = unzipSync(bytes);
  extra['../escape'] = strToU8('no');
  await assert.rejects(parseAipPack(zipSync(extra)), /Unexpected/);
});

test('world bundle persists atomically and serves airports, runways, navaids and routing offline', async () => {
  await importAipPack({ size: bytes.length, arrayBuffer: async () => bytes.buffer });
  const metadata = await listAipPacks();
  assert.equal(metadata.length, 1);
  assert.ok(metadata[0].airportCount > 80000);
  assert.equal(metadata[0].airports, undefined);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network must not be used'); };
  try {
    const search = await queryInstalledAip('skylinetragedy_search_airports', { p_query: 'KLAX', p_limit: 10 });
    assert.equal(search.airports[0].icao, 'KLAX');
    assert.equal(search.billing.chargedTokens, 0);
    const detail = await queryInstalledAip('skylinetragedy_airport_details', { p_airport_code: 'KLAX' });
    assert.ok(detail.airport.runways.length);
    assert.ok(detail.airport.frequencies.length);
    const nearby = await queryInstalledAip('skylinetragedy_airports_within_radius', {
      p_latitude: detail.airport.latitude, p_longitude: detail.airport.longitude, p_radius_nm: 5
    });
    assert.ok(nearby.airports.some(airport => airport.icao === 'KLAX'));
    const navaids = await queryInstalledAip('skylinetragedy_nearest_navaids', {
      p_latitude: detail.airport.latitude, p_longitude: detail.airport.longitude, p_radius_nm: 150
    });
    assert.ok(navaids.navaids.length);
    const options = await queryInstalledAip('skylinetragedy_nearest_suitable_airports', {
      p_latitude: detail.airport.latitude, p_longitude: detail.airport.longitude, p_radius_nm: 30, p_min_runway_length_ft: 8000
    });
    assert.ok(options.options.length);
    assert.ok(options.options.every(option => option.bestRunway.length >= 8000));
    const store = await loadLocalAipCsvStore({ forceReload: true });
    assert.ok(store.counts.lookupRows > 0);
    assert.ok(store.counts.edgeRows > 0);
  } finally { globalThis.fetch = originalFetch; }
  await removeAipPack();
  assert.equal(await readAipPack(), null);
});
