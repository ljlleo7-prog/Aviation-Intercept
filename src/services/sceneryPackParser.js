import { Unzip, UnzipInflate, strFromU8 } from 'fflate';
import { validateGroundPackage } from './validateGroundPackage.js';
import sceneryAirports from '../config/sceneryAirports.js';

export const SCENERY_LIMITS = { zip: 128 * 1024 * 1024, expanded: 384 * 1024 * 1024, file: 16 * 1024 * 1024, entries: 512 };
export const SCENERY_AIRPORTS = Object.keys(sceneryAirports);
const fail = message => { throw new Error(message); };
const safePath = name => /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(name) && !name.split('/').some(part => part === '..' || part === '.');
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0);
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function checkZipDirectory(bytes, files) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) fail('Incomplete ZIP directory.');
  const count = view.getUint16(end + 10, true);
  const listed = new Set();
  let offset = view.getUint32(end + 16, true);
  if (view.getUint32(end + 4, true) !== 0 || count !== Object.keys(files).length
    || offset + view.getUint32(end + 12, true) !== end) fail('Unsupported or incomplete ZIP directory.');
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail('Invalid ZIP directory.');
    const length = view.getUint16(offset + 28, true);
    const name = strFromU8(bytes.subarray(offset + 46, offset + 46 + length));
    if (listed.has(name)) fail('Duplicate ZIP directory entry.');
    listed.add(name);
    const data = files[name];
    if (!data || (view.getUint16(offset + 8, true) & 1) || data.length !== view.getUint32(offset + 24, true)
      || crc32(data) !== view.getUint32(offset + 16, true)) fail('Corrupt or encrypted ZIP entry.');
    offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (offset !== end) fail('Invalid ZIP directory length.');
}

// Bound actual inflated output as well as declared sizes.
export function extractSceneryZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > SCENERY_LIMITS.zip || bytes.length < 22
    || new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) !== 0x04034b50) fail('Choose a valid scenery ZIP (maximum 128 MiB).');
  const files = Object.create(null); const names = new Set();
  let expanded = 0; let pending = 0;
  const unzip = new Unzip(file => {
    if (!safePath(file.name) || names.has(file.name) || names.size >= SCENERY_LIMITS.entries) fail('Invalid, duplicate, or excessive ZIP entries.');
    names.add(file.name);
    if (file.originalSize > SCENERY_LIMITS.file) fail('A ZIP entry exceeds 16 MiB.');
    let size = 0; const chunks = []; pending++;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      size += chunk.length; expanded += chunk.length;
      if (size > SCENERY_LIMITS.file || expanded > SCENERY_LIMITS.expanded) fail('Expanded scenery exceeds storage import limits.');
      chunks.push(chunk);
      if (final) {
        const result = new Uint8Array(size); let offset = 0;
        for (const part of chunks) { result.set(part, offset); offset += part.length; }
        files[file.name] = result; pending--;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    // Small compressed input chunks avoid unbounded output from a single push.
    for (let offset = 0; offset < bytes.length; offset += 4096) unzip.push(bytes.subarray(offset, offset + 4096), offset + 4096 >= bytes.length);
    if (pending) fail('Incomplete ZIP archive.');
  } catch (error) { fail(`Cannot decompress scenery ZIP: ${error.message}`); }
  checkZipDirectory(bytes, files);
  return files;
}

const point = value => Array.isArray(value) && value.length === 2 && value.every(n => Number.isFinite(n) && Math.abs(n) <= 100000);
const path = value => Array.isArray(value) && value.length >= 2 && value.length <= 50000 && value.every(point);
const area = value => Array.isArray(value) && value.length > 0 && value.length <= 5000
  && value.every(rings => Array.isArray(rings) && rings.length > 0 && rings.every(ring => path(ring) && ring.length >= 3));

export function validateImportedLayout(value, code) {
  try {
    if (!validateGroundPackage(value, code) || !area(value.operatingArea)
      || Math.abs(value.origin.latitude) > 90 || Math.abs(value.origin.longitude) > 180
      || value.bounds.minX >= value.bounds.maxX || value.bounds.minZ >= value.bounds.maxZ
      || Math.abs(value.visualAlignment.x) > 1000 || Math.abs(value.visualAlignment.z) > 1000
      || value.provenance?.licence !== 'ODbL-1.0') return false;
    for (const kind of ['runways', 'taxiways']) {
      if (!Array.isArray(value[kind]) || value[kind].length > 10000 || !value[kind].every(item => item && path(item.path)
        && Number.isFinite(item.width) && item.width > 0 && item.width <= 500)) return false;
    }
    if (!Array.isArray(value.aprons) || !value.aprons.every(item => item && area(item.area))
      || !Array.isArray(value.buildings) || value.buildings.length > 2000
      || !value.buildings.every(item => item && ['x', 'z', 'width', 'depth', 'height', 'heading'].every(key => Number.isFinite(item[key]))
        && item.width > 0 && item.depth > 0 && item.height > 0 && item.height <= 1000
        && (!item.footprint || area(item.footprint)))) return false;
    for (const mesh of Object.values(value.meshes)) {
      if (mesh.positions.length > 500000 || mesh.positions.some(n => Math.abs(n) > 100000)
        || mesh.chunks.length > 5000 || mesh.chunks.some(chunk => chunk.minX > chunk.maxX || chunk.minZ > chunk.maxZ)
        || mesh.chunks.reduce((sum, chunk) => sum + chunk.indices.length, 0) > 90000) return false;
    }
    return true;
  } catch { return false; }
}

export async function parseSceneryPack(bytes) {
  const files = extractSceneryZip(bytes);
  const json = name => {
    if (!files[name]) fail(`Missing pack file: ${name}`);
    try { return JSON.parse(strFromU8(files[name])); }
    catch { fail(`Invalid JSON: ${name}`); }
  };
  const manifest = json('manifest.json');
  if (!manifest || manifest.schemaVersion !== 1 || manifest.compatibility !== 'airport-ground-v1'
    || typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)
    || typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 120
    || typeof manifest.version !== 'string' || !/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(manifest.version)
    || manifest.licence !== 'ODbL-1.0' || !Array.isArray(manifest.airports) || !manifest.airports.length
    || manifest.airports.length > SCENERY_AIRPORTS.length) fail('Unsupported scenery pack manifest.');
  const airports = Object.create(null); const references = Object.create(null);
  if (!globalThis.crypto?.subtle) fail('Scenery import requires HTTPS or localhost.');
  for (const entry of manifest.airports) {
    if (!entry || !SCENERY_AIRPORTS.includes(entry.code) || airports[entry.code]
      || entry.file !== `airports/${entry.code}.json` || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('Invalid or unsupported airport entry.');
    if (!files[entry.file]) fail(`Missing pack file: ${entry.file}`);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', files[entry.file]);
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== entry.sha256) fail(`Checksum mismatch: ${entry.code}`);
    const layout = json(entry.file);
    if (!validateImportedLayout(layout, entry.code)) fail(`Invalid scenery geometry: ${entry.code}`);
    if (entry.reference) {
      if (!validateSceneryReference(entry.reference, entry.code, layout)) fail(`Invalid runway reference: ${entry.code}`);
      references[entry.code] = entry.reference;
    } else if (!['KLAX', 'VHHH', 'ZSPD', 'ZGGG', 'ZBAA', 'KATL', 'KLGA', 'EGLL', 'WSSS', 'OMDB'].includes(entry.code)) fail(`Missing runway reference: ${entry.code}`);
    airports[entry.code] = layout;
  }
  if (!files['LICENSE.txt']) fail('Missing pack licence.');
  return { id: manifest.id, name: manifest.name, version: manifest.version, airports, references,
    installedAt: new Date().toISOString(), bytes: bytes.length };
}

export function validateSceneryReference(reference, code, layout) {
  const airport = reference?.airport;
  if (!airport || airport.icao !== code || airport.iata !== sceneryAirports[code]?.iata || typeof airport.name !== 'string'
    || airport.name.length > 200 || airport.type !== 'normal' || !['latitude', 'longitude', 'elevation'].every(key => Number.isFinite(airport[key]))
    || Math.abs(airport.latitude - layout.origin.latitude) > .2 || Math.abs(airport.longitude - layout.origin.longitude) > .3
    || !Array.isArray(reference.runways) || !reference.runways.length || reference.runways.length > 20) return false;
  const labels = new Set();
  return reference.runways.every(row => {
    if (!Array.isArray(row) || row.length !== 9 || !row.slice(0, 2).every(label => typeof label === 'string' && /^(0[1-9]|[12][0-9]|3[0-6])[LCR]?$/.test(label))
      || labels.has(row[0]) || labels.has(row[1]) || !row.slice(2).every(Number.isFinite)
      || row[6] < 300 || row[6] > 25000 || row[7] < 10 || row[7] > 400 || Math.abs(row[8] - airport.elevation) > 500) return false;
    labels.add(row[0]); labels.add(row[1]);
    const project = (lat, lon) => [(lon - layout.origin.longitude) * 111320 * Math.cos(layout.origin.latitude * Math.PI / 180), -(lat - layout.origin.latitude) * 111320];
    const start = project(row[2], row[3]); const end = project(row[4], row[5]);
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const heading = (Math.atan2(end[0] - start[0], -(end[1] - start[1])) * 180 / Math.PI + 360) % 360;
    const headingError = Math.abs(((heading - Number(row[0].slice(0, 2)) * 10 + 540) % 360) - 180);
    if (headingError > 45 || Math.abs(distance(start, end) - row[6] * .3048) > 5) return false;
    return layout.runways.some(strip => {
      const [a, b] = [strip.path[0], strip.path.at(-1)];
      return Math.abs(strip.width - row[7] * .3048) < 1
        && Math.min(Math.max(distance(start, a), distance(end, b)), Math.max(distance(start, b), distance(end, a))) < 25;
    });
  });
}

