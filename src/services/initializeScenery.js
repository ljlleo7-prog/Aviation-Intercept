import sceneryRunways from '../data/sceneryRunways.js';
import { airportService } from './airportService.js';
import { listSceneryPacks, selectInstalledPack } from './sceneryPackStorage.js';
import { setScenerySnapshot } from './airportGroundPackages.js';

// Run before rendering flight selection so synchronous runway/physics lookups agree.
export async function initializeScenery() {
  await airportService.loadInstalledAirports();
  try {
    const packs = await listSceneryPacks();
    const references = {};
    for (const code of new Set(packs.flatMap(pack => Object.keys(pack.references || {})))) {
      const pack = selectInstalledPack(packs, code);
      const reference = pack?.references?.[code];
      // Layouts were validated at import; avoid loading all ground meshes at startup.
      if (reference) {
        references[code] = reference;
        sceneryRunways[code] = reference;
      }
    }
    airportService.applySceneryReferences(references);
    setScenerySnapshot(packs);
  } catch { setScenerySnapshot([]); /* Bundled scenery works without browser storage. */ }
}
