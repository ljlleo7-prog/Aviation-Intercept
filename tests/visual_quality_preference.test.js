import test from 'node:test';
import assert from 'node:assert/strict';
import { readVisualQuality, writeVisualQuality, nextAutoEconomy, outsideRenderBudget } from '../src/utils/visualQualityPreference.js';

test('outside visual quality defaults to Balanced and persists Economy', () => {
  const original = globalThis.localStorage;
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };
  try {
    assert.equal(readVisualQuality(), 'balanced');
    assert.equal(writeVisualQuality('economy'), 'economy');
    assert.equal(readVisualQuality(), 'economy');
    assert.equal(writeVisualQuality('other'), 'balanced');
    assert.equal(readVisualQuality(), 'balanced');
  } finally {
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  }
});

test('automatic Economy uses altitude hysteresis around 10,000 ft AGL', () => {
  assert.equal(nextAutoEconomy(false, 10000), false);
  assert.equal(nextAutoEconomy(false, 11100), true);
  assert.equal(nextAutoEconomy(true, 10000), true);
  assert.equal(nextAutoEconomy(true, 8900), false);
});

test('render budgets cap frame rate and total pixels on large and retina screens', () => {
  for (const [width, height, dpr] of [[1920, 420, 2], [3840, 800, 3], [700, 240, 2], [1400, 600, 1]]) {
    const balanced = outsideRenderBudget('balanced', width, height, dpr);
    const economy = outsideRenderBudget('economy', width, height, dpr);
    assert.equal(balanced.fps, 30); assert.equal(economy.fps, 20);
    assert.ok(width * height * balanced.pixelRatio ** 2 <= 420001);
    assert.ok(width * height * economy.pixelRatio ** 2 <= 200001);
    assert.ok(balanced.pixelRatio <= 1);
    assert.ok(economy.pixelRatio <= .65);
    assert.ok(economy.pixelRatio <= balanced.pixelRatio);
  }
});

test('exterior light spill is culled aloft and restored near the ground with hysteresis', async () => {
  const { outsideLightRanges } = await import('../src/utils/visualQualityPreference.js');
  let ranges = outsideLightRanges(undefined, 0);
  assert.deepEqual(ranges, { ground: true, landing: true });
  ranges = outsideLightRanges(ranges, 200);
  assert.deepEqual(ranges, { ground: false, landing: true });
  ranges = outsideLightRanges(ranges, 160);
  assert.equal(ranges.ground, false);
  ranges = outsideLightRanges(ranges, 110);
  assert.equal(ranges.ground, true);
  ranges = outsideLightRanges(ranges, 5000);
  assert.deepEqual(ranges, { ground: false, landing: false });
  ranges = outsideLightRanges(ranges, 1500);
  assert.equal(ranges.landing, false);
  ranges = outsideLightRanges(ranges, 1200);
  assert.equal(ranges.landing, true);
  assert.equal(outsideLightRanges(ranges, undefined), ranges);
});
