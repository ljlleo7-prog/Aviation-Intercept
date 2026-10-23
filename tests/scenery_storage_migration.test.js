import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { listSceneryPacks, readInstalledAirport, saveSceneryPack, removeSceneryPack } from '../src/services/sceneryPackStorage.js';

const name = 'aviation-intercept-scenery-v1';
async function seed(factory, configure) {
  await new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => configure(request.result);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  });
}

async function withDatabase(configure, check) {
  const previous = globalThis.indexedDB;
  const factory = new IDBFactory();
  await seed(factory, configure);
  globalThis.indexedDB = factory;
  try { await check(); } finally { globalThis.indexedDB = previous; }
}

const original = { id: 'legacy', name: 'Legacy Pack', version: '1.0.0', installedAt: 'original', bytes: 12,
  references: {}, airports: { KORD: { marker: 'saved ground geometry' } } };

test('version 1 packs-only database migrates embedded layouts without losing installed scenery', async () => {
  await withDatabase(db => {
    db.createObjectStore('packs', { keyPath: 'id' }).put(original);
  }, async () => {
    const packs = await listSceneryPacks();
    assert.equal(packs.length, 1);
    assert.deepEqual(packs[0].airportCodes, ['KORD']);
    assert.equal(packs[0].installedAt, original.installedAt);
    assert.equal(Object.hasOwn(packs[0], 'airports'), false);
    assert.deepEqual(await readInstalledAirport('KORD'), original.airports.KORD);
    await saveSceneryPack({ ...original, version: '1.1.0' });
    assert.equal((await listSceneryPacks())[0].version, '1.1.0');
    await removeSceneryPack(original.id);
    assert.equal(await readInstalledAirport('KORD'), null);
    assert.deepEqual(await listSceneryPacks(), []);
  });
});

test('version 1 database with separate layouts preserves existing geometry during upgrade', async () => {
  await withDatabase(db => {
    const { airports, ...metadata } = original;
    db.createObjectStore('packs', { keyPath: 'id' }).put({ ...metadata, airportCodes: ['KORD'] });
    db.createObjectStore('layouts').put(airports.KORD, [original.id, 'KORD']);
  }, async () => {
    assert.deepEqual(await readInstalledAirport('KORD'), original.airports.KORD);
    assert.equal((await listSceneryPacks())[0].version, '1.0.0');
  });
});

test('empty version 1 database gains both stores and supports imports', async () => {
  await withDatabase(() => {}, async () => {
    assert.deepEqual(await listSceneryPacks(), []);
    await saveSceneryPack(original);
    assert.deepEqual(await readInstalledAirport('KORD'), original.airports.KORD);
  });
});
