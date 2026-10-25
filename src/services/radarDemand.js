import { getEffectiveRadarPreferences } from '../utils/apiAccessMode.js';

let networkAllowed = true;
const runners = new Set();
export function setRadarNetworkAllowed(allowed) {
  networkAllowed = allowed;
  runners.forEach(runner => runner.refresh());
}

// Mounted, visible consumers own demand; there is no background queue drain.
export function attachRadarDemand(service, kind, fetchBatch) {
  const views = new Map();
  let timer = null;
  let generation = 0;
  let controller = null;
  let running = false;
  let lastRequestAt = -Infinity;
  let spacing = service.GRID_SIZE;
  const stop = () => {
    clearTimeout(timer); timer = null;
    generation++;
    controller?.abort();
    service.fetchQueue = [];
  };
  const allowed = () => networkAllowed && views.size && (typeof document === 'undefined' || !document.hidden);
  const refresh = () => {
    if (!allowed()) { stop(); return; }
    if (timer || running) return;
    timer = setTimeout(tick, 1000);
  };
  const tick = async () => {
    timer = null;
    if (!allowed()) { stop(); return; }
    const preferences = getEffectiveRadarPreferences();
    if (spacing !== preferences[`${kind}Spacing`]) {
      spacing = preferences[`${kind}Spacing`];
      service.GRID_SIZE = spacing;
      service.cache.clear();
      generation++;
    }
    const queue = new Map();
    for (const args of views.values()) {
      service.update(args[0], args[1], Math.min(args[2], preferences[`${kind}Range`]), args[3]);
      service.fetchQueue.forEach(item => queue.set(item.key, item));
    }
    service.fetchQueue = [...queue.values()].sort((a, b) => (a.priority ?? a.distSq) - (b.priority ?? b.distSq));
    if (Date.now() - lastRequestAt >= preferences[`${kind}Interval`] * 1000 && service.fetchQueue.length) {
      lastRequestAt = Date.now();
      const token = generation;
      const requestController = new AbortController();
      controller = requestController;
      service.requestSignal = requestController.signal;
      service.isRequestCurrent = () => token === generation && !requestController.signal.aborted;
      running = true;
      try { await fetchBatch(); } catch { /* Active ticks retry after provider cooldown. */ }
      finally { running = false; controller = null; }
    }
    refresh();
  };
  const runner = { refresh };
  runners.add(runner);
  service.setView = (id, args) => { views.set(id, args); refresh(); };
  service.removeView = id => { views.delete(id); if (!views.size) stop(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh);
  return {
    stop,
    dispose() {
      views.clear(); stop(); runners.delete(runner);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh);
    }
  };
}
