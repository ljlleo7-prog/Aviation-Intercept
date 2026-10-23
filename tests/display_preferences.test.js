import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDisplayPreferences, readDisplayPreferences, writeDisplayPreferences } from '../src/utils/displayPreferences.js';

test('display preferences reject malformed values and remain usable without storage', () => {
  const storage = globalThis.localStorage;
  const document = globalThis.document;
  globalThis.document = { documentElement: { dataset: {} } };
  try {
    assert.deepEqual(normalizeDisplayPreferences(null), { motion: 'system', contrast: 'standard' });
    assert.deepEqual(normalizeDisplayPreferences({ motion: 'bad', contrast: 'bad' }), readDisplayPreferences());
    const values = new Map();
    globalThis.localStorage = {
      getItem: key => values.get(key),
      setItem: (key, value) => values.set(key, value)
    };
    const preferences = { motion: 'reduced', contrast: 'high' };
    writeDisplayPreferences(preferences);
    assert.deepEqual(readDisplayPreferences(), preferences);
    assert.deepEqual(globalThis.document.documentElement.dataset, preferences);
    globalThis.localStorage = {
      getItem() { throw new Error('Blocked'); },
      setItem() { throw new Error('Quota'); }
    };
    assert.deepEqual(readDisplayPreferences(), { motion: 'system', contrast: 'standard' });
    assert.deepEqual(writeDisplayPreferences(preferences), preferences);
  } finally {
    if (storage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = storage;
    if (document === undefined) delete globalThis.document;
    else globalThis.document = document;
  }
});
