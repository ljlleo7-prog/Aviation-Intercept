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

