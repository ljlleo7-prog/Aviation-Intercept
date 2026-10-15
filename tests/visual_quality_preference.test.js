import test from 'node:test';
import assert from 'node:assert/strict';
import { readVisualQuality, writeVisualQuality, nextAutoEconomy } from '../src/utils/visualQualityPreference.js';

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
