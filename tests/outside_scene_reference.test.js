import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainSceneReference } from '../src/utils/outsideSceneReference.js';

test('terrain uses aircraft coordinates with no runway or airport, including valid zero coordinates', () => {
  for (const position of [{ latitude: 0, longitude: 0 }, { latitude: 25.4, longitude: 110.2 }]) {
    const reference = terrainSceneReference(position, 1600);
    assert.equal(reference.terrainOnly, true);
    assert.deepEqual(reference.thresholdStart, { ...position, elevation: 1600 });
    assert.equal(reference.length, 0, 'must not invent a runway');
  }
  assert.equal(terrainSceneReference({ latitude: NaN, longitude: 20 }), null);
});
