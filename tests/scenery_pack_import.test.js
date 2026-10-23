import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { indexedDB, IDBObjectStore } from 'fake-indexeddb';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { parseSceneryPack, importSceneryPack, validateImportedLayout, SCENERY_LIMITS } from '../src/services/sceneryPackImport.js';
import { listSceneryPacks, removeSceneryPack, readInstalledAirport, saveSceneryPack } from '../src/services/sceneryPackStorage.js';

globalThis.indexedDB = indexedDB;
const root = new URL('../scenery-packs/', import.meta.url);
const layoutBytes = new Uint8Array(await readFile(new URL('../public/scenery/airports/EGLL.json', import.meta.url)));
const sample = zipSync({
  'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1, compatibility: 'airport-ground-v1', id: 'test-europe', name: 'Test Europe', version: '1.0.0', licence: 'ODbL-1.0',
    airports: [{ code: 'EGLL', file: 'airports/EGLL.json', sha256: createHash('sha256').update(layoutBytes).digest('hex') }] })),
  'LICENSE.txt': strToU8('© OpenStreetMap contributors · ODbL 1.0'),
  'airports/EGLL.json': layoutBytes
});
const rewrite = (change) => {
  const files = unzipSync(sample);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  change(files, manifest);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files);
};
const file = bytes => new Blob([bytes], { type: 'application/zip' });

test('all release ZIP packs pass actual import validation', async () => {
  const catalog = JSON.parse(await readFile(new URL('catalog.json', root)));
  for (const item of catalog) {
    const bytes = new Uint8Array(await readFile(new URL(item.file, root)));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    const pack = await parseSceneryPack(bytes);
    assert.deepEqual(Object.keys(pack.airports), item.airports);
    assert.equal(pack.version, '1.0.0');
  }
});

test('file import persists, replaces atomically, rejects downgrade, removes and loads fallback', async () => {
  const installed = await importSceneryPack(file(sample));
  assert.equal((await listSceneryPacks()).length, 1);
  assert.deepEqual(await readInstalledAirport('EGLL'), installed.airports.EGLL);
  await importSceneryPack(file(sample));
  assert.equal((await listSceneryPacks()).length, 1, 'reimport is idempotent');
  const updated = rewrite((files, manifest) => { manifest.version = '1.1.0'; });
  await importSceneryPack(file(updated));
  await assert.rejects(importSceneryPack(file(sample)), /newer version/);
  await assert.rejects(importSceneryPack(file(rewrite(files => { delete files['airports/EGLL.json']; }))), /Missing pack/);
  assert.equal((await listSceneryPacks())[0].version, '1.1.0', 'failed import preserves installed version');
  const { loadAirportGroundPackage } = await import('../src/services/airportGroundPackages.js?installed-test');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Installed scenery must work offline'); };
  assert.equal((await loadAirportGroundPackage('LHR')).airportCode, 'EGLL');
  await removeSceneryPack(installed.id);
  assert.equal(await readInstalledAirport('EGLL'), null);
  globalThis.fetch = async () => ({ ok: true, json: async () => installed.airports.EGLL });
  const fallback = await import('../src/services/airportGroundPackages.js?fallback-test');
  assert.equal((await fallback.loadAirportGroundPackage('EGLL')).airportCode, 'EGLL');
  globalThis.fetch = originalFetch;
});

test('overlapping packs use version then stable ID; removing winner restores other pack', async () => {
  const pack = await parseSceneryPack(sample);
  await saveSceneryPack({ ...pack, id: 'region', version: '2.0.0' });
  await saveSceneryPack({ ...pack, id: 'hubs', version: '1.0.0', airports: { EGLL: { marker: true } } });
  assert.equal((await readInstalledAirport('EGLL')).airportCode, 'EGLL');
  await removeSceneryPack('region');
  assert.equal((await readInstalledAirport('EGLL')).marker, true);
  await removeSceneryPack('hubs');
});

test('reject invalid manifests, missing data, checksum tampering, unsupported airports and unsafe paths', async () => {
  const cases = [
    [(files, m) => { m.schemaVersion = 2; }, /manifest/],
    [(files, m) => { m.version = 'latest'; }, /manifest/],
    [(files, m) => { m.airports[0].code = 'XXXX'; }, /airport entry/],
    [(files, m) => { m.airports.push(m.airports[0]); }, /airport entry/],
    [files => { delete files['LICENSE.txt']; }, /licence/],
    [files => { files['airports/EGLL.json'][30] ^= 1; }, /Checksum/],
    [files => { files['../escape.json'] = strToU8('{}'); }, /ZIP entries/],
    [files => { files['/absolute.json'] = strToU8('{}'); }, /ZIP entries/],
    [files => { files['manifest.json'] = strToU8('bad'); }, null]
  ];
  for (const [change, pattern] of cases.filter(item => item[1])) await assert.rejects(parseSceneryPack(rewrite(change)), pattern);
  const badJSON = unzipSync(sample); badJSON['manifest.json'] = strToU8('{');
  await assert.rejects(parseSceneryPack(zipSync(badJSON)), /Invalid JSON/);
  await assert.rejects(parseSceneryPack(strToU8('not a zip')), /valid scenery ZIP/);
  await assert.rejects(importSceneryPack({ size: SCENERY_LIMITS.zip + 1 }), /128 MiB/);
});

test('reject malformed geometry even if hashes match', async () => {
  const bytes = rewrite((files, manifest) => {
    const layout = JSON.parse(strFromU8(files['airports/EGLL.json']));
    layout.taxiways[0].path = [null];
    files['airports/EGLL.json'] = strToU8(JSON.stringify(layout));
    manifest.airports[0].sha256 = createHash('sha256').update(files['airports/EGLL.json']).digest('hex');
  });
  await assert.rejects(parseSceneryPack(bytes), /Invalid scenery geometry/);
  assert.equal(validateImportedLayout(null, 'EGLL'), false);
});

test('storage failure rejects without dropping current packs', async () => {
  const old = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try { await assert.rejects(importSceneryPack(file(sample)), /storage is unavailable/); }
  finally { globalThis.indexedDB = old; }
});


test('new airport references register before selection and align rendering with physics', async () => {
  const { airportService } = await import('../src/services/airportService.js');
  const { initializeScenery } = await import('../src/services/initializeScenery.js');
  const { getVisualRunwayGeometry } = await import('../src/data/visualRunwayCoordinates.js');
  const { canonicalAirportCode } = await import('../src/utils/airportGroundCoordinates.js');
  const archive = unzipSync(new Uint8Array(await readFile(new URL('major-hubs-1.0.0.zip', root))));
  const manifest = JSON.parse(strFromU8(archive['manifest.json']));
  const entry = manifest.airports.find(airport => airport.code === 'KORD');
  const layout = JSON.parse(strFromU8(archive[entry.file]));
  const references = { KORD: entry.reference };
  await saveSceneryPack({ id: 'registration-test', name: 'Registration Test', version: '1.0.0', installedAt: 'test', bytes: 1, airports: { KORD: layout }, references });
  await initializeScenery();
  assert.equal(canonicalAirportCode(' ord '), 'KORD');
  const airport = airportService.getAirportByCode('ORD');
  const names = references.KORD.runways.map(row => `${row[0]}/${row[1]}`);
  assert.deepEqual(airport.runways.map(runway => runway.name), names);
  for (const row of references.KORD.runways) {
    const visual = getVisualRunwayGeometry('ORD', row[0], null);
    const physics = airportService.getRunwayGeometry('ORD', row[0]);
    assert.deepEqual(physics.thresholdStart, visual.thresholdStart);
    assert.equal(visual.thresholdStart.latitude, row[2]);
    assert.equal(visual.thresholdEnd.longitude, row[5]);
  }
  const { loadAirportGroundPackage } = await import('../src/services/airportGroundPackages.js?optional-registration');
  assert.equal((await loadAirportGroundPackage('ORD')).airportCode, 'KORD');
  await removeSceneryPack('registration-test');
});

test('truncated archives and CRC corruption are rejected', async () => {
  await assert.rejects(parseSceneryPack(sample.subarray(0, sample.length - 10)), /ZIP/);
  const damaged = new Uint8Array(sample);
  const view = new DataView(damaged.buffer);
  for (let offset = 0; offset < damaged.length - 4; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) { damaged[offset + 16] ^= 1; break; }
  }
  await assert.rejects(parseSceneryPack(damaged), /Corrupt/);
});


test('storage write failure rolls back the entire replacement', async () => {
  const original = await parseSceneryPack(sample);
  await saveSceneryPack(original);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'layouts') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
    return put.apply(this, args);
  };
  try { await assert.rejects(saveSceneryPack({ ...original, version: '2.0.0' })); }
  finally { IDBObjectStore.prototype.put = put; }
  assert.equal((await listSceneryPacks())[0].version, '1.0.0');
  assert.equal((await readInstalledAirport('EGLL')).airportCode, 'EGLL');
  await removeSceneryPack(original.id);
});

test('reject oversized expanded files and excessive ZIP entries', async () => {
  const oversized = zipSync({ 'oversized.json': new Uint8Array(SCENERY_LIMITS.file + 1) });
  await assert.rejects(parseSceneryPack(oversized), /16 MiB/);
  const entries = Object.fromEntries(Array.from({ length: SCENERY_LIMITS.entries + 1 }, (_, index) => [`file-${index}.json`, strToU8('{}')]));
  await assert.rejects(parseSceneryPack(zipSync(entries)), /excessive ZIP entries/);
});


test('bundled airports remain separate from optional release coverage', async () => {
  const coverage = JSON.parse(await readFile(new URL('coverage.json', root)));
  const bundled = new Set(coverage.bundledAirports);
  assert.equal(bundled.size, 10);
  assert.equal(coverage.optionalAirports.length, 90);
  assert.equal(new Set([...bundled, ...coverage.optionalAirports.map(airport => airport.icao)]).size, 100);
  assert.ok(coverage.optionalAirports.every(airport => !bundled.has(airport.icao)));
});

test('new packs stay inactive until the next startup snapshot', async () => {
  const { setScenerySnapshot, loadAirportGroundPackage } = await import('../src/services/airportGroundPackages.js');
  setScenerySnapshot([]);
  await saveSceneryPack({ id: 'snapshot-test', name: 'Snapshot Test', version: '1.0.0', installedAt: 'snapshot', bytes: 1, airports: { KORD: { marker: true } }, references: {} });
  assert.equal(await loadAirportGroundPackage('ORD'), null, 'importing before a flight must not activate ground without its runway references');
  setScenerySnapshot(await listSceneryPacks());
  assert.equal((await loadAirportGroundPackage('ORD')).marker, true);
  await removeSceneryPack('snapshot-test');
  setScenerySnapshot([]);
});


test('the combined release activates all 90 additional airports with matching physics and visual runway geometry', async () => {
  const { airportService } = await import('../src/services/airportService.js');
  const { initializeScenery } = await import('../src/services/initializeScenery.js');
  const { getVisualRunwayGeometry } = await import('../src/data/visualRunwayCoordinates.js');
  const originalTypes = new Map(airportService.getAllAirports().map(airport => [airport.icao, airport.type]));
  const pack = await importSceneryPack(file(await readFile(new URL('major-hubs-1.0.0.zip', root))));
  await initializeScenery();
  const metadata = (await listSceneryPacks()).find(item => item.id === pack.id);
  assert.equal(metadata.airportCodes.length, 90);
  assert.equal(Object.hasOwn(metadata, 'airports'), false, 'startup metadata excludes ground geometry');
  for (const [code, reference] of Object.entries(pack.references)) {
    const airport = airportService.getAirportByCode(code);
    assert.ok(airport, `${code} is registered`);
    if (originalTypes.has(code)) assert.equal(airport.type, originalTypes.get(code), `${code} keeps its selection type`);
    for (const row of reference.runways) {
      const visual = getVisualRunwayGeometry(code, row[0], null);
      const physics = airportService.getRunwayGeometry(code, row[0]);
      assert.deepEqual(physics.thresholdStart, visual.thresholdStart, `${code}/${row[0]} spawn matches visual runway`);
      assert.deepEqual(physics.thresholdEnd, visual.thresholdEnd);
    }
  }
  await removeSceneryPack(pack.id);
});
