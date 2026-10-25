import { loadLocalAipCsvStore } from './aipCsvDataStore.js';
import { aipLoadingProgress } from './aipLoadingProgress.js';

let preloadPromise = null;

export const preloadLocalAipData = async () => {
  if (preloadPromise) return preloadPromise;

  preloadPromise = loadLocalAipCsvStore({
    progressCallback: (fileName, loaded, total) => {
      if (loaded === 0 && total > 0) {
        aipLoadingProgress.startFile(fileName, total);
      } else if (loaded > 0) {
        aipLoadingProgress.updateFile(fileName, loaded);
      }
    }
  }).then(() => {
    aipLoadingProgress.complete();
    return true;
  }).catch((error) => {
    preloadPromise = null;
    console.warn('Failed to preload local AIP data:', error);
    aipLoadingProgress.complete();
    return false;
  });

  return preloadPromise;
};
