import { parseSceneryPack, SCENERY_LIMITS } from './sceneryPackParser.js';
import { saveSceneryPack } from './sceneryPackStorage.js';
export { parseSceneryPack, validateImportedLayout, extractSceneryZip, SCENERY_LIMITS } from './sceneryPackParser.js';
const fail = message => { throw new Error(message); };

export async function importSceneryPack(file) {
  if (!file || file.size > SCENERY_LIMITS.zip) fail('Choose a scenery ZIP smaller than 128 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pack = typeof Worker === 'undefined' ? await parseSceneryPack(bytes) : await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sceneryPackWorker.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Scenery import timed out.')); }, 120000);
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    worker.onmessage = event => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.pack);
    };
    worker.onerror = () => { finish(); reject(new Error('Could not process scenery ZIP.')); };
    worker.postMessage(bytes, [bytes.buffer]);
  });
  return saveSceneryPack(pack);
}
