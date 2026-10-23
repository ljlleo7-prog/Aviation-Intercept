import { parseCsv as parseCsvText } from '../../utils/csv.js';
import { loadInstalledAipPack } from '../aipPackStorage.js';

const defaultCsvDir = '/AIP_DATA/supabase_csv';

const FILES = {
  lookup: 'aip_route_lookup_index.csv',
  legs: 'aip_route_legs.csv',
  points: 'aip_reference_points.csv',
  edges: 'aip_route_edge_index.csv'
};

let cachedStore = null;

const joinUrlPath = (base, file) => `${String(base || '').replace(/\/$/, '')}/${file}`;

const readCsvText = async (csvDir, fileName, readFile, progressCallback) => {
  const filePath = joinUrlPath(csvDir, fileName);
  if (readFile) return readFile(filePath);

  if (typeof fetch !== 'function') {
    throw new Error('Local AIP CSV loading requires fetch or a readFile option.');
  }

  const installed = await loadInstalledAipPack();
  if (installed?.files[fileName]) return installed.files[fileName];
  const response = await fetch(filePath);
  if (!response.ok) throw new Error(`Failed to load ${filePath}: ${response.status}`);

  if (!progressCallback || !response.body) return response.text();

  const total = parseInt(response.headers.get('content-length') || '0', 10);
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  if (progressCallback) progressCallback(fileName, loaded, total);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (progressCallback) progressCallback(fileName, loaded, total);
  }

  const decoder = new TextDecoder('utf-8');
  return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('') + decoder.decode();
};

const parseCsv = async (csvDir, fileName, readFile, progressCallback) => parseCsvText(await readCsvText(csvDir, fileName, readFile, progressCallback));

const key = (...parts) => parts.map((part) => String(part || '').toUpperCase()).join('|');

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const routePairKeys = (row) => [
  key(row.region_code, row.aip_cycle, row.departure_code, row.arrival_code),
  key('*', row.aip_cycle, row.departure_code, row.arrival_code),
  key(row.region_code, '*', row.departure_code, row.arrival_code),
  key('*', '*', row.departure_code, row.arrival_code)
];

const addToListMap = (map, mapKey, value) => {
  if (!map.has(mapKey)) map.set(mapKey, []);
  map.get(mapKey).push(value);
};

const loadLocalAipCsvStore = async ({ csvDir = defaultCsvDir, forceReload = false, readFile = null, progressCallback = null } = {}) => {
  if (cachedStore && !forceReload) return cachedStore;

  const [lookupRows, legRows, pointRows, edgeRows] = await Promise.all([
    parseCsv(csvDir, FILES.lookup, readFile, progressCallback),
    parseCsv(csvDir, FILES.legs, readFile, progressCallback),
    parseCsv(csvDir, FILES.points, readFile, progressCallback),
    parseCsv(csvDir, FILES.edges, readFile, progressCallback)
  ]);

  const lookupByPair = new Map();
  const legsByRouteId = new Map();
  const pointsByIdent = new Map();
  const pointsByIdentRegion = new Map();
  const edgesByFrom = new Map();

  for (const row of lookupRows) {
    const normalized = {
      ...row,
      lookup_rank: Number(row.lookup_rank || 0)
    };
    for (const lookupKey of routePairKeys(normalized)) {
      addToListMap(lookupByPair, lookupKey, normalized);
    }
  }

  for (const row of legRows) {
    addToListMap(legsByRouteId, row.route_id, {
      ...row,
      leg_sequence: Number(row.leg_sequence || 0)
    });
  }

  for (const legs of legsByRouteId.values()) {
    legs.sort((a, b) => a.leg_sequence - b.leg_sequence);
  }

  for (const row of pointRows) {
    const latitude = toNumber(row.latitude_deg);
    const longitude = toNumber(row.longitude_deg);
    const ident = String(row.ident || '').toUpperCase();
    if (!ident || latitude === null || longitude === null) continue;

    const point = {
      ...row,
      ident,
      latitude,
      longitude,
      frequency_khz: toNumber(row.frequency_khz),
      dme_frequency_khz: toNumber(row.dme_frequency_khz)
    };
    addToListMap(pointsByIdent, ident, point);
    addToListMap(pointsByIdentRegion, key(ident, point.region_code), point);
    addToListMap(pointsByIdentRegion, key(ident, point.iso_country), point);
  }

  for (const row of edgeRows) {
    const fromFix = String(row.from_fix || '').toUpperCase();
    const toFix = String(row.to_fix || '').toUpperCase();
    if (!fromFix || !toFix) continue;
    addToListMap(edgesByFrom, fromFix, {
      ...row,
      from_fix: fromFix,
      to_fix: toFix,
      leg_sequence: Number(row.leg_sequence || 0)
    });
  }

  cachedStore = {
    csvDir,
    lookupByPair,
    legsByRouteId,
    pointsByIdent,
    pointsByIdentRegion,
    edgesByFrom,
    counts: {
      lookupRows: lookupRows.length,
      legRows: legRows.length,
      pointRows: pointRows.length,
      edgeRows: edgeRows.length,
      pointIndexSize: [...pointsByIdent.values()].reduce((total, points) => total + points.length, 0)
    }
  };

  return cachedStore;
};

const resetLocalAipCsvStore = () => {
  cachedStore = null;
};

export { defaultCsvDir, key as createAipIndexKey, loadLocalAipCsvStore, resetLocalAipCsvStore };
