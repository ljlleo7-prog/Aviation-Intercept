const DB_NAME = 'aviation-intercept-aip-v1';

async function transaction(mode, action) {
  if (!globalThis.indexedDB) throw new Error('Browser storage is unavailable.');
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('Browser AIP storage timed out.')); }, 4000);
    request.onupgradeneeded = () => request.result.createObjectStore('packs', { keyPath: 'id' });
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); expired = true; reject(new Error('Close other simulator tabs and retry.')); };
    request.onsuccess = () => {
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      if (expired) request.result.close(); else resolve(request.result);
    };
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction('packs', mode);
    let result;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || new Error('AIP storage operation failed.')); };
    try { action(tx.objectStore('packs'), value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export const listAipPacks = () => transaction('readonly', (store, done) => {
  store.getAll().onsuccess = event => done(event.target.result.map(({ airports, navaids, files, ...metadata }) => ({
    ...metadata, airportCount: airports.length, navaidCount: navaids.length, fileCount: Object.keys(files).length
  })));
});
export const readAipPack = () => transaction('readonly', (store, done) => {
  store.get('world-aip').onsuccess = event => done(event.target.result || null);
});
export const saveAipPack = pack => transaction('readwrite', store => store.put(pack));
export const removeAipPack = () => transaction('readwrite', store => store.delete('world-aip'));

let snapshot;
export function loadInstalledAipPack() {
  if (!snapshot) snapshot = readAipPack().catch(() => null);
  return snapshot;
}
