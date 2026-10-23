const DB_NAME = 'aviation-intercept-scenery-v1';

async function database() {
  if (!globalThis.indexedDB) throw new Error('Browser storage is unavailable.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('Browser scenery storage timed out.')); }, 4000);
    request.onupgradeneeded = () => {
      const db = request.result;
      const packs = db.objectStoreNames.contains('packs')
        ? request.transaction.objectStore('packs') : db.createObjectStore('packs', { keyPath: 'id' });
      const layouts = db.objectStoreNames.contains('layouts')
        ? request.transaction.objectStore('layouts') : db.createObjectStore('layouts');
      // Early installations kept airport layouts inside pack records. Move them
      // in the upgrade transaction so an interrupted migration cannot lose data.
      packs.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (!cursor) return;
        const { airports, ...metadata } = cursor.value;
        if (airports) {
          for (const [code, layout] of Object.entries(airports)) layouts.put(layout, [metadata.id, code]);
          cursor.update({ ...metadata, airportCodes: Object.keys(airports) });
        }
        cursor.continue();
      };
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      if (expired) request.result.close(); else resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('Close other simulator tabs and try again.')); };
  });
}

async function transaction(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction(['packs', 'layouts'], mode); }
    catch (error) { db.close(); reject(error); return; }
    let result;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save scenery.')); };
    try { action(tx.objectStore('packs'), value => { result = value; }, tx.objectStore('layouts')); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  });
}

export const listSceneryPacks = () => transaction('readonly', (store, done) => {
  store.getAll().onsuccess = event => done(event.target.result);
});
export const removeSceneryPack = id => transaction('readwrite', (store, done, layouts) => {
  store.get(id).onsuccess = event => {
    for (const code of event.target.result?.airportCodes || []) layouts.delete([id, code]);
    store.delete(id);
  };
});

export function saveSceneryPack(pack) {
  return transaction('readwrite', (store, done, layouts) => {
    // One transaction serializes concurrent imports and makes replacements atomic.
    store.getAll().onsuccess = event => {
      try {
        const existing = event.target.result.find(item => item.id === pack.id);
        if (existing && compareVersions(pack.version, existing.version) < 0) {
          done({ error: 'A newer version of this pack is already installed.' });
          return;
        }
        for (const code of existing?.airportCodes || []) layouts.delete([pack.id, code]);
        const { airports, ...metadata } = pack;
        for (const [code, layout] of Object.entries(airports)) layouts.put(layout, [pack.id, code]);
        store.put({ ...metadata, airportCodes: Object.keys(airports) });
        done({ pack });
      } catch { store.transaction.abort(); }
    };
  }).then(result => {
    if (result.error) throw new Error(result.error);
    return result.pack;
  });
}

export function compareVersions(a, b) {
  const left = a.split('.').map(Number); const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

export async function readInstalledAirport(code, snapshot) {
  const pack = selectInstalledPack(snapshot || await listSceneryPacks(), code);
  if (!pack) return null;
  return transaction('readonly', (store, done, layouts) => {
    // A session snapshot must not accidentally use an updated pack's old runway references.
    store.get(pack.id).onsuccess = event => {
      const current = event.target.result;
      if (current?.installedAt !== pack.installedAt || current?.version !== pack.version) { done(null); return; }
      layouts.get([pack.id, code]).onsuccess = result => done(result.target.result || null);
    };
  });
}

export function selectInstalledPack(packs, code) {
  // Explicit priority: newest pack version, then stable pack ID for overlapping regions.
  const ordered = [...packs].sort((a, b) => compareVersions(b.version, a.version) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return ordered.find(pack => pack.airportCodes.includes(code)) || null;
}
