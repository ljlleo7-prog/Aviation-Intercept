// Offline, deterministic comparisons. Never calls a terrain provider.
import assert from 'node:assert/strict';
import { TerrainRadarService } from '../src/services/TerrainRadarService.js';

function createRadar({ grid = 0.01, cache } = {}) {
  const radar = new TerrainRadarService();
  radar.GRID_SIZE = grid;
  if (cache) radar.cache = new Map(cache);
  const stats = { requests: 0, samples: 0 };
  radar.fetchElevationData = async batch => {
    stats.requests++;
    stats.samples += batch.length;
    radar.processResults(batch, batch.map(() => ({ elevation: 100 })));
  };
  return { radar, stats };
}

async function drain(options = {}) {
  const { radar, stats } = createRadar(options);
  radar.update(30, 120, options.range ?? 20, 90);
  const cells = radar.fetchQueue.length;
  while (radar.fetchQueue.length) await radar.fetchNextBatch();
  assert.equal(stats.samples, cells);
  assert.equal(stats.requests, Math.ceil(cells / 20));
  return { radar, ...stats, cells };
}

async function timed({ demandStop = false, interval = 1 } = {}) {
  const { radar, stats } = createRadar();
  // 10 minutes visible, then 20 minutes with no terrain consumer.
  radar.update(30, 120, 80, 90);
  for (let second = 0; second < 1800; second++) {
    if (demandStop && second >= 600) continue;
    if (second % interval === 0) await radar.fetchNextBatch();
  }
  return { ...stats, pending: radar.fetchQueue.length };
}

const rows = [];
function compare(method, baseline, candidate, note) {
  assert.ok(candidate.requests <= baseline.requests);
  rows.push({ method, baseline: baseline.requests, candidate: candidate.requests,
    saved: baseline.requests - candidate.requests,
    reduction: `${((1 - candidate.requests / baseline.requests) * 100).toFixed(1)}%`, note });
}

const full = await drain();
compare('Stop when no consumers', await timed(), await timed({ demandStop: true }),
  '30 min; 80 nm; visible first 10 min. Saves unused work; active coverage unchanged.');
compare('Range 20 to 10 nm', full, await drain({ range: 10 }),
  'Cold stationary area, fully loaded; detailed coverage radius halves.');
compare('Grid 0.01 to 0.02 degrees', full, await drain({ grid: 0.02 }),
  'Cold stationary 20 nm area, fully loaded; spacing doubles (~1.1 to ~2.2 km north/south).');
const coldReload = await drain();
const warmReload = await drain({ cache: full.radar.cache });
compare('Persist cache across reload', coldReload, warmReload,
  'Repeat same fully loaded 20 nm area; ideal valid persistent-cache hit. First visit saves 0.');
compare('Request interval 1 to 5 seconds', await timed(), await timed({ interval: 5 }),
  '30 min cold 80 nm area; defers samples. Full-load request total is unchanged.');
// Tabs have independent module state today. A shared cache with request coalescing
// would fetch identical cells once; this is an ideal upper bound, not implemented.
compare('Share cache + coalesce across 2 tabs', { requests: full.requests * 2 }, full,
  'Two identical cold 20 nm views; ideal shared-worker/cache upper bound.');
console.table(rows);
console.log(JSON.stringify({ assumptions: {
  latitude: 30, longitude: 120, batchSize: 20, response: 'All samples valid; instantaneous success; no 429s, latency, fallback, or motion.',
  timing: 'One dispatch per eligible virtual second. Actual fetch loop adds network latency.',
  isolation: 'Each row changes one method only. No production behavior changed.'
}, baseline20Nm: { cells: full.cells, requests: full.requests }, results: rows }, null, 2));
