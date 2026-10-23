import { projectGroundPoint } from './airportGroundCoordinates.js';

export function pointInRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i]; const [c, d] = ring[j];
    if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}
export const pointInArea = (point, area) => area.some(([outer, ...holes]) => pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole)));

export function distanceToPath(point, path) {
  let closest = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]; const b = path[i];
    const dx = b[0] - a[0]; const dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    closest = Math.min(closest, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  return closest;
}

// Coordinates match the translated airport ground drawn in the outside view.
export function airportSurfaceAt(geo, layout) {
  if (!layout?.origin) return null;
  const point = projectGroundPoint(geo.lat, geo.lon, layout.origin);
  point[0] -= layout.visualAlignment?.x || 0;
  point[1] -= layout.visualAlignment?.z || 0;
  const contains = (item) => item.area
    ? pointInArea(point, item.area)
    : distanceToPath(point, item.path || []) <= item.width / 2;
  if (layout.runways?.some(contains)) return 'PAVED';
  if (layout.aprons?.some(contains)) return 'APRON';
  if (layout.taxiways?.some(contains)) return 'TAXIWAY';
  if (layout.operatingArea && pointInArea(point, layout.operatingArea)) return 'GRASS';
  return null;
}
