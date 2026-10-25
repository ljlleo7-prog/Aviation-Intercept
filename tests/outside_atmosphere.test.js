import test from 'node:test';
import assert from 'node:assert/strict';
import { outsideAtmosphere } from '../src/utils/outsideAtmosphere.js';

test('sunny low altitude stays clear with either visibility unit', () => {
  for (const visibility of [10, 10000, 20000]) {
    assert.equal(outsideAtmosphere(2000, { visibility, cloudCover: 10 }).gloom, 0);
  }
  assert.equal(outsideAtmosphere(0).gloom, 0);
});

test('poor visibility, cloud cover and rain independently grey the low sky', () => {
  for (const weather of [
    { visibility: 2000 }, { cloudCover: 100 },
    { precipitation: 2 }, { weatherCode: 63 }
  ]) {
    assert.equal(outsideAtmosphere(2000, weather).gloom, 1);
    assert.equal(outsideAtmosphere(16000, weather).gloom, 0);
  }
  assert.equal(outsideAtmosphere(12000, { precipitation: 2 }).gloom, 0);
});

test('cruise blend completes between 8000 and 16000 feet', () => {
  assert.equal(outsideAtmosphere(8000).cruiseBlend, 0);
  assert.equal(outsideAtmosphere(12000).cruiseBlend, .5);
  assert.equal(outsideAtmosphere(16000).cruiseBlend, 1);
  assert.deepEqual(outsideAtmosphere(35000), outsideAtmosphere(16000));
});
