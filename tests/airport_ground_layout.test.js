import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createProceduralGround, pathFootprint, pointInArea, projectGroundPoint, triangulateGround, unprojectGroundPoint } from '../src/utils/airportGroundLayout.js';
import { validateGroundPackage } from '../src/services/airportGroundPackages.js';
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
  assert.equal(validateGroundPackage({ ...layout, schemaVersion: 999 }, code), false);
  assert.equal(validateGroundPackage({ ...layout, bounds: { ...layout.bounds, maxX: Infinity } }, code), false);
  const corrupt = structuredClone(layout);
  corrupt.meshes.taxiway.indices[0] = -1;
  assert.equal(validateGroundPackage(corrupt, code), false);
});
