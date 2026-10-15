import { canonicalAirportCode } from '../utils/airportGroundCoordinates.js';

const supported = new Set(['KLAX', 'VHHH']);
const cache = new Map();

export function validateGroundPackage(value, code) {
  if (!value || value.schemaVersion !== 1 || value.airportCode !== code || value.source !== 'openstreetmap'
    || !Number.isFinite(value.origin?.latitude) || !Number.isFinite(value.origin?.longitude)
    || !value.operatingArea?.length || !value.taxiways?.length || !value.runways?.length
    || value.visualAlignment?.accepted !== true || !Number.isFinite(value.visualAlignment.x) || !Number.isFinite(value.visualAlignment.z)) return false;
  if (!['minX', 'minZ', 'maxX', 'maxZ'].every((key) => Number.isFinite(value.bounds?.[key]))
    || value.bounds.maxX - value.bounds.minX > 30000 || value.bounds.maxZ - value.bounds.minZ > 30000) return false;
  let triangles = 0;
  for (const kind of ['land', 'apron', 'taxiway', 'roads']) {
    const mesh = value.meshes?.[kind];
    if (!Array.isArray(mesh?.positions) || mesh.positions.length % 2 || !mesh.positions.every(Number.isFinite)
      || !Array.isArray(mesh.indices) || mesh.indices.length % 3 || !Array.isArray(mesh.chunks)) return false;
    if (!mesh.indices.every((index) => Number.isInteger(index) && index >= 0 && index * 2 < mesh.positions.length)) return false;
    if (!mesh.chunks.every((chunk) => ['minX', 'minZ', 'maxX', 'maxZ'].every((key) => Number.isFinite(chunk[key]))
      && Array.isArray(chunk.indices) && chunk.indices.length % 3 === 0
      && chunk.indices.every((index) => Number.isInteger(index) && index >= 0 && index * 2 < mesh.positions.length))) return false;
    triangles += mesh.indices.length / 3;
  }
  return triangles <= 30000;
}

export function loadAirportGroundPackage(airportCode) {
  const code = canonicalAirportCode(airportCode);
  if (!supported.has(code)) return Promise.resolve(null);
  if (cache.has(code)) return cache.get(code);
  const base = import.meta.env?.BASE_URL || '/';
  const pending = fetch(`${base}scenery/airports/${code}.json`, { signal: AbortSignal.timeout(6000) })
    .then(async (response) => {
      if (!response.ok) return null;
      const value = await response.json();
      return validateGroundPackage(value, code) ? value : null;
    }).catch(() => null);
  cache.set(code, pending);
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  return pending;
}
