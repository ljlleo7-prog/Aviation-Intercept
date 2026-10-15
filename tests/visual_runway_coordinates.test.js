import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisualRunwayGeometry } from '../src/data/visualRunwayCoordinates.js';

test('visual runway coordinates preserve distinct parallel VHHH strips and reciprocal ends', () => {
  const left = getVisualRunwayGeometry('VHHH', '25R', null);
  const right = getVisualRunwayGeometry('VHHH', '25L', null);
  const reciprocal = getVisualRunwayGeometry('VHHH', '07L', null);
  assert.ok(left && right && reciprocal);
  assert.notEqual(left.thresholdStart.latitude, right.thresholdStart.latitude);
  assert.equal(left.thresholdStart.latitude, reciprocal.thresholdEnd.latitude);
  assert.equal(left.thresholdStart.longitude, reciprocal.thresholdEnd.longitude);
  assert.equal(left.geometrySource, 'local-aip');
});

test('visual runway coordinates retain fallback for airports without surveyed visual overrides', () => {
  const fallback = { runwayName: '25R', length: 2000 };
  assert.equal(getVisualRunwayGeometry('XXXX', '25R', fallback), fallback);
});
