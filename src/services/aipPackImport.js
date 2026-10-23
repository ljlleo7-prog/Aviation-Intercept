import { unzipSync, strFromU8 } from 'fflate';
import { saveAipPack } from './aipPackStorage.js';

export const AIP_ROUTE_FILES = ['aip_route_lookup_index.csv', 'aip_route_legs.csv', 'aip_reference_points.csv', 'aip_route_edge_index.csv'];
export const AIP_SOURCE_FILES = ['airports', 'runways', 'frequencies', 'navaids', 'regions', 'raw_sources', 'route_catalog', 'route_airport_index', 'route_lookup_index', 'route_tokens', 'route_legs', 'route_edge_index', 'reference_points'].map(name => `aip_${name}.csv`);
const ALLOWED = [...new Set(['airports.json', 'navaids.json', ...AIP_SOURCE_FILES])];
const EXPECTED = ['airports.json', 'navaids.json', ...AIP_ROUTE_FILES];
const MAX_ZIP = 32 * 1048576;
const MAX_EXPANDED = 96 * 1048576;
const fail = message => { throw new Error(message); };
export async function parseAipPack(bytes) {
  if (!bytes?.length || bytes.length > MAX_ZIP) fail('AIP ZIP exceeds the 32 MiB limit.');
  let expanded = 0; let count = 0;
  const archive = unzipSync(bytes, { filter: file => {
    expanded += file.originalSize; count++;
    if (!['manifest.json', 'NOTICE.txt', ...ALLOWED].includes(file.name)) fail('Unexpected AIP archive file.');
    if (expanded > MAX_EXPANDED || count > ALLOWED.length + 2) fail('AIP archive exceeds extraction limits.');
    return true;
  } });
  const manifest = JSON.parse(strFromU8(archive['manifest.json'] || new Uint8Array()));
  if (manifest.schemaVersion !== 1 || manifest.id !== 'world-aip' || manifest.coverage !== 'world'
    || !/^\d+\.\d+\.\d+$/.test(manifest.version) || typeof manifest.name !== 'string'
    || !manifest.files || Object.keys(manifest.files).some(name => !ALLOWED.includes(name))) fail('Unsupported AIP manifest.');
  for (const name of EXPECTED) {
    if (!manifest.files[name]) fail(`Missing AIP data: ${name}`);
  }
  if (manifest.sourceTables && AIP_SOURCE_FILES.some(name => !manifest.files[name])) fail('Incomplete AIP source tables.');
  for (const name of Object.keys(manifest.files)) {
    if (!archive[name] || !/^[a-f0-9]{64}$/.test(manifest.files[name])) fail(`Missing AIP data: ${name}`);
    const digest = await crypto.subtle.digest('SHA-256', archive[name]);
    const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (hash !== manifest.files[name]) fail(`AIP checksum failed: ${name}`);
  }
  const airports = JSON.parse(strFromU8(archive['airports.json']));
  const navaids = JSON.parse(strFromU8(archive['navaids.json']));
  const position = item => Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
    && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180;
  if (!Array.isArray(airports) || !airports.length || airports.length > 150000
    || airports.some(airport => !position(airport) || typeof airport.icao !== 'string' || !airport.icao
      || typeof airport.name !== 'string' || !Array.isArray(airport.runways) || !Array.isArray(airport.frequencies))) fail('Invalid AIP airports.');
  if (!Array.isArray(navaids) || navaids.length > 100000 || navaids.some(item => !position(item))) fail('Invalid AIP navaids.');
  const files = Object.fromEntries(AIP_SOURCE_FILES.filter(name => archive[name]).map(name => [name, strFromU8(archive[name])]));
  return { id: manifest.id, name: manifest.name, version: manifest.version, coverage: manifest.coverage,
    source: manifest.source, sourceTables: manifest.sourceTables, airports, navaids, files, bytes: bytes.length, installedAt: new Date().toISOString() };
}
export async function importAipPack(file) {
  if (!file || file.size > MAX_ZIP) fail('Choose an AIP ZIP smaller than 32 MiB.');
  const pack = await parseAipPack(new Uint8Array(await file.arrayBuffer()));
  await saveAipPack(pack);
  return pack;
}
