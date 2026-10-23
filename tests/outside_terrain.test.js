import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainRequestCenter, terrainViewRange } from '../src/utils/outsideTerrain.js';

test('terrain geometry reaches beyond the horizon during climb regardless of weather visibility', () => {
  for (const feet of [0, 5000, 10000, 40000]) {
    const height = feet * 0.3048;
    const horizon = Math.sqrt(height * (2 * 6371000 + height));
    const { far, surfaceSize } = terrainViewRange(height);
    assert.ok(far > horizon);
    assert.ok(far > height);
    assert.ok(surfaceSize / 2 > far, 'surface must cover the view in every direction');
  }
  assert.equal(terrainViewRange(NaN).far, 60000);
});

test('terrain sampling follows position and leads the current heading', () => {
  const north = terrainRequestCenter(30, 120, 0);
  const east = terrainRequestCenter(30, 120, 90);
  const south = terrainRequestCenter(31, 121, 180);
  assert.ok(north.latitude > 30);
  assert.equal(north.longitude, 120);
  assert.ok(east.longitude > 120);
  assert.ok(south.latitude < 31);
  assert.equal(south.longitude, 121);
  const atHighLatitude = terrainRequestCenter(75, 120, 90);
  assert.ok(atHighLatitude.longitude - 120 > east.longitude - 120);
});
