import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProceduralGround, distanceToPath, groundAlignment, pathFootprint, pointInArea, projectGroundPoint, triangulateGround, unionAreas, unprojectGroundPoint } from '../src/utils/airportGroundLayout.js';
import { resolveVisualRunways } from '../src/utils/airportGroundCoordinates.js';
import { loadAirportGroundPackage, validateGroundPackage } from '../src/services/airportGroundPackages.js';
import { getVisualRunwayGeometry } from '../src/data/visualRunwayCoordinates.js';

const origin = { latitude: 33.9425, longitude: -118.4081 };
const runway = getVisualRunwayGeometry('KLAX', '06L', null);
const reciprocal = getVisualRunwayGeometry('KLAX', '24R', null);
const triangleArea = (mesh) => {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.slice(i, i + 3).map((index) => mesh.positions.slice(index * 2, index * 2 + 2));
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  return area;
};

test('ground projection round trips at airport latitude', () => {
  const point = { latitude: 33.95, longitude: -118.43 };
  const restored = unprojectGroundPoint(projectGroundPoint(point.latitude, point.longitude, origin), origin);
  assert.ok(Math.abs(restored.latitude - point.latitude) < 1e-10);
  assert.ok(Math.abs(restored.longitude - point.longitude) < 1e-10);
});

test('triangulation preserves infield holes and chunks cover every triangle once', () => {
  const mesh = triangulateGround([[[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], [[20, 20], [20, 80], [80, 80], [80, 20], [20, 20]]]]);
  assert.ok(Math.abs(triangleArea(mesh) - 6400) < .01);
  assert.equal(mesh.chunks.reduce((sum, chunk) => sum + chunk.indices.length, 0), mesh.indices.length);
});

test('procedural taxiways, aprons and buildings stay fixed on reciprocal runway selection', () => {
  const a = createProceduralGround('KLAX', [runway], origin);
  const b = createProceduralGround('KLAX', [reciprocal], origin);
  assert.deepEqual(a, b);
  assert.ok(a.taxiways.length >= 5 && a.aprons.length > 0 && a.buildings.length > 0);
  for (const building of a.buildings) assert.ok(pointInArea([building.x, building.z], a.aprons.flatMap((apron) => apron.area)));
  const total = Object.values(a.meshes).reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
  assert.ok(total < 2000);
});

const runwayFromMetres = (length, z = 0, name = '09') => ({
  airportLat: 0, airportLon: length / 2 / 111320, runwayName: name, heading: 90, length, width: 45,
  thresholdStart: { ...unprojectGroundPoint([0, z], { latitude: 0, longitude: 0 }), elevation: 0 },
  thresholdEnd: { ...unprojectGroundPoint([length, z], { latitude: 0, longitude: 0 }), elevation: 0 }
});

for (const length of [850, 3000]) test(`${length} m fallback has a parallel backbone, runway connections and separate apron links`, () => {
  const layout = createProceduralGround('TEST', [runwayFromMetres(length)], { latitude: 0, longitude: 0 });
  const main = layout.taxiways.find((taxiway) => taxiway.role === 'parallel');
  assert.ok(main);
  assert.ok(Math.abs(main.path[1][0] - main.path[0][0]) >= length * .95);
  assert.ok(Math.abs(main.path[1][1] - main.path[0][1]) < .001);
  const entries = layout.taxiways.filter((taxiway) => taxiway.role === 'runway-entry');
  const exits = layout.taxiways.filter((taxiway) => taxiway.role === 'runway-exit');
  assert.equal(entries.length, 2); assert.ok(exits.length >= 3);
  assert.ok(entries[0].path[0][0] < 60 && entries[1].path[0][0] > length - 60);
  for (const route of [...entries, ...exits]) {
    assert.ok(distanceToPath(route.path.at(-1), main.path) < .001);
    assert.ok(distanceToPath(route.path[0], layout.runways[0].path) < layout.runways[0].width / 2);
  }
  assert.equal(layout.aprons.length, 1);
  const apron = layout.aprons[0].area;
  const apronLinks = layout.taxiways.filter((taxiway) => taxiway.role === 'apron-link');
  assert.equal(apronLinks.length, 2);
  for (const link of apronLinks) {
    assert.ok(distanceToPath(link.path[0], main.path) < .001);
    assert.ok(pointInArea(link.path.at(-1), apron));
  }
  assert.ok(apron[0][0].every((point) => distanceToPath(point, main.path) >= 60));
  const apronLane = layout.taxiways.find((taxiway) => taxiway.role === 'apron-taxilane');
  assert.ok(apronLane.path.every((point) => pointInArea(point, apron)));
  const connected = unionAreas([...layout.taxiways.map((taxiway) => pathFootprint(taxiway.path, taxiway.width)),
    ...layout.aprons.map((item) => item.area), ...layout.runways.map((strip) => pathFootprint(strip.path, strip.width))]);
  assert.equal(connected.length, 1, 'pavement must form one connected network');
  assert.ok(Object.values(layout.meshes).reduce((sum, mesh) => sum + mesh.indices.length / 3, 0) < 2000);
});

test('parallel runways retain independent continuous backbones and clear aprons', () => {
  const layout = createProceduralGround('TEST', [runwayFromMetres(3000, 0, '09L'), runwayFromMetres(3000, 800, '09R')], { latitude: 0, longitude: 0 });
  const main = layout.taxiways.filter((taxiway) => taxiway.role === 'parallel');
  assert.equal(main.length, 2);
  for (const lane of main) {
    for (const strip of layout.runways) assert.ok(lane.path.every((point) => distanceToPath(point, strip.path) > 100));
  }
  assert.equal(layout.aprons.length, 2);
});

test('approximate coincident runway offsets are shared by pavement and fallback generation', () => {
  const active = runwayFromMetres(3000, 0, '09L');
  const other = runwayFromMetres(3000, 0, '09R');
  const resolved = resolveVisualRunways(active, [other]);
  assert.equal(resolved[0], active);
  assert.equal(resolved[1].geometrySource, 'procedural-offset');
  const projected = projectGroundPoint(resolved[1].thresholdStart.latitude, resolved[1].thresholdStart.longitude, active.thresholdStart);
  assert.ok(Math.abs(projected[1] - 400) < .001);
  const layout = createProceduralGround('TEST', resolved, { latitude: 0, longitude: 0 });
  assert.equal(layout.taxiways.filter((taxiway) => taxiway.role === 'parallel').length, 2);
  const surveyed = { ...other, thresholdStart: { ...other.thresholdStart, latitude: -.01 }, thresholdEnd: { ...other.thresholdEnd, latitude: -.01 } };
  assert.equal(resolveVisualRunways(active, [surveyed])[1], surveyed);
  assert.equal(resolveVisualRunways({ ...active, geometrySource: 'local-aip' }, [other])[1], other);
});

test('buffered taxiway bends and duplicate input points produce finite, bounded surfaces', () => {
  const area = pathFootprint([[0, 0], [0, 0], [100, 0], [110, 50], [120, 100]], 23);
  assert.ok(area.flat(3).every(Number.isFinite));
  assert.ok(triangleArea(triangulateGround(area)) > 2000);
  assert.deepEqual(pathFootprint([[0, 0], [0, 0]], 23), []);
});

test('surveyed visual runway bearing follows threshold coordinates rather than rounded labels', () => {
  const end = projectGroundPoint(runway.thresholdEnd.latitude, runway.thresholdEnd.longitude, runway.thresholdStart);
  const bearing = (Math.atan2(end[0], -end[1]) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(bearing - runway.heading) < .02);
  assert.ok(Math.abs(((reciprocal.heading - runway.heading + 360) % 360) - 180) < .001);
});

for (const code of ['KLAX', 'VHHH']) test(`${code} distributed scenery is valid, bounded, attributed and reproducible`, async () => {
  const layout = JSON.parse(await readFile(new URL(`../public/scenery/airports/${code}.json`, import.meta.url), 'utf8'));
  assert.equal(validateGroundPackage(layout, code), true);
  assert.ok(layout.taxiways.length > 20 && layout.aprons.length > 0);
  assert.match(layout.provenance.attribution, /OpenStreetMap/);
  assert.ok(layout.buildings.every((building) => building.width < 1500 && building.depth < 1000));
  const references = [...new Set(layout.runways.map((strip) => strip.ref.split('/')[0]))]
    .map((end) => getVisualRunwayGeometry(code, end, null)).filter(Boolean);
  // Recheck after serialization: rounding the WGS84 origin to millidegrees
  // would shift an otherwise correct airport by tens of metres.
  const alignment = groundAlignment(layout, references);
  assert.equal(alignment.accepted, true);
  assert.ok(Math.hypot(alignment.x - layout.visualAlignment.x, alignment.z - layout.visualAlignment.z) < .05);
  assert.equal(validateGroundPackage({ ...layout, schemaVersion: 999 }, code), false);
  assert.equal(validateGroundPackage({ ...layout, bounds: { ...layout.bounds, maxX: Infinity } }, code), false);
  const corrupt = structuredClone(layout);
  corrupt.meshes.taxiway.indices[0] = -1;
  assert.equal(validateGroundPackage(corrupt, code), false);
});

test('unknown airports make no scenery request; known aliases share one cached request', async () => {
  const original = globalThis.fetch;
  const layout = JSON.parse(await readFile(new URL('../public/scenery/airports/KLAX.json', import.meta.url), 'utf8'));
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => layout }; };
  try {
    assert.equal(await loadAirportGroundPackage('XXXX'), null);
    assert.equal(calls, 0);
    const [a, b] = await Promise.all([loadAirportGroundPackage('LAX'), loadAirportGroundPackage('KLAX')]);
    assert.equal(a, b); assert.equal(a.airportCode, 'KLAX'); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
