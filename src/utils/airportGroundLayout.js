import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2 } from 'three';
import { canonicalAirportCode, projectGroundPoint } from './airportGroundCoordinates.js';
export { canonicalAirportCode, projectGroundPoint, unprojectGroundPoint } from './airportGroundCoordinates.js';

const DEG = Math.PI / 180;
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

export function groundAlignment(layout, referenceRunways) {
  const deltas = [];
  for (const runway of referenceRunways) {
    const candidates = layout.runways.filter((source) => String(source.ref).split('/').includes(runway.runwayName));
    if (!candidates.length) continue;
    for (const threshold of [runway.thresholdStart, runway.thresholdEnd]) {
      const point = projectGroundPoint(threshold.latitude, threshold.longitude, layout.origin);
      let nearest = null; let distance = Infinity;
      for (const source of candidates) for (let i = 1; i < source.path.length; i++) {
        const a = source.path[i - 1]; const b = source.path[i];
        const dx = b[0] - a[0]; const dz = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1)));
        const match = [a[0] + t * dx, a[1] + t * dz];
        const error = Math.hypot(point[0] - match[0], point[1] - match[1]);
        if (error < distance) { distance = error; nearest = match; }
      }
      if (nearest) deltas.push([point[0] - nearest[0], point[1] - nearest[1]]);
    }
  }
  if (!deltas.length) return { accepted: false, x: 0, z: 0, reason: 'No matching runway references' };
  const x = deltas.reduce((sum, point) => sum + point[0], 0) / deltas.length;
  const z = deltas.reduce((sum, point) => sum + point[1], 0) / deltas.length;
  const maxResidualM = Math.max(...deltas.map((point) => Math.hypot(point[0] - x, point[1] - z)));
  return { accepted: Math.hypot(x, z) <= 120 && maxResidualM <= 20, x, z, maxResidualM,
    reason: 'Visual translation to existing operational runway references; original OSM coordinates are preserved' };
}

// A bounded miter joins road/taxiway segments without adding terrain detail.
export function pathFootprint(path, width) {
  const clean = path.filter((point, i) => !i || Math.hypot(point[0] - path[i - 1][0], point[1] - path[i - 1][1]) > .1);
  if (clean.length < 2) return [];
  const left = []; const right = [];
  for (let i = 0; i < clean.length; i++) {
    const before = clean[Math.max(0, i - 1)]; const after = clean[Math.min(clean.length - 1, i + 1)];
    const length = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
    const nx = -(after[1] - before[1]) / length; const nz = (after[0] - before[0]) / length;
    const next = clean[Math.min(clean.length - 1, i + 1)];
    const previous = clean[Math.max(0, i - 1)];
    const segment = i === clean.length - 1 ? [clean[i][0] - previous[0], clean[i][1] - previous[1]] : [next[0] - clean[i][0], next[1] - clean[i][1]];
    const segmentLength = Math.hypot(...segment) || 1;
    const correction = Math.min(1.8, 1 / Math.max(.55, Math.abs(nx * -segment[1] / segmentLength + nz * segment[0] / segmentLength)));
    const half = width / 2 * correction;
    left.push([clean[i][0] + nx * half, clean[i][1] + nz * half]);
    right.push([clean[i][0] - nx * half, clean[i][1] - nz * half]);
  }
  const ring = [...left, ...right.reverse()]; ring.push(ring[0]);
  return [[ring]];
}

// Snap boolean-operation inputs to a centimetre grid. Near-identical GIS
// intersections otherwise create cyclic zero-area rings in dense layouts.
const cleanArea = (area) => area.map((rings) => rings.map((ring) => {
  const rounded = ring.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
  const unique = rounded.filter((point, i) => !i || point[0] !== rounded[i - 1][0] || point[1] !== rounded[i - 1][1]);
  if (unique.length && (unique[0][0] !== unique.at(-1)[0] || unique[0][1] !== unique.at(-1)[1])) unique.push(unique[0]);
  return unique;
}).filter((ring) => ring.length >= 4)).filter((rings) => rings.length);
export const unionAreas = (areas) => {
  const valid = areas.filter((area) => area?.length).map(cleanArea).filter((area) => area.length);
  return valid.length ? polygonClipping.union(...valid) : [];
};
export const subtractAreas = (area, ...others) => area.length ? polygonClipping.difference(cleanArea(area), ...others.filter((other) => other.length).map(cleanArea)) : [];
export const intersectAreas = (a, b) => a.length && b.length ? polygonClipping.intersection(cleanArea(a), cleanArea(b)) : [];

function subtractInTiles(area, others, size = 1000) {
  const points = area.flat(2);
  const minX = Math.floor(Math.min(...points.map((p) => p[0])) / size) * size;
  const minZ = Math.floor(Math.min(...points.map((p) => p[1])) / size) * size;
  const maxX = Math.max(...points.map((p) => p[0])); const maxZ = Math.max(...points.map((p) => p[1]));
  const result = [];
  for (let x = minX; x < maxX; x += size) for (let z = minZ; z < maxZ; z += size) {
    const tile = [[[[x, z], [x + size, z], [x + size, z + size], [x, z + size], [x, z]]]];
    const subject = intersectAreas(area, tile);
    if (!subject.length) continue;
    const clips = others.map((other) => intersectAreas(other, tile)).filter((other) => other.length);
    try { result.push(...subtractAreas(subject, ...clips)); }
    catch (error) {
      if (size <= 250) throw error;
      result.push(...subtractInTiles(subject, clips, size / 2));
    }
  }
  return result;
}

export function triangulateGround(area) {
  const positions = []; const indices = [];
  for (const rings of area) {
    const vectors = rings.map((ring) => {
      const points = ring.map(([x, z]) => new Vector2(x, z));
      if (points[0]?.equals(points[points.length - 1])) points.pop();
      return points;
    });
    if (vectors[0].length < 3) continue;
    const offset = positions.length / 2;
    const faces = ShapeUtils.triangulateShape(vectors[0], vectors.slice(1));
    vectors.flat().forEach((point) => positions.push(Math.round(point.x * 10) / 10, Math.round(point.y * 10) / 10));
    // Local second coordinate is south (+Z), so reverse the XY triangulation.
    faces.forEach(([a, b, c]) => indices.push(offset + c, offset + b, offset + a));
  }
  const buckets = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    const x = triangle.reduce((sum, index) => sum + positions[index * 2], 0) / 3;
    const z = triangle.reduce((sum, index) => sum + positions[index * 2 + 1], 0) / 3;
    const key = `${Math.floor(x / 1000)}:${Math.floor(z / 1000)}`;
    if (!buckets.has(key)) buckets.set(key, { indices: [], minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity });
    const chunk = buckets.get(key); chunk.indices.push(...triangle);
    triangle.forEach((index) => {
      chunk.minX = Math.min(chunk.minX, positions[index * 2]); chunk.maxX = Math.max(chunk.maxX, positions[index * 2]);
      chunk.minZ = Math.min(chunk.minZ, positions[index * 2 + 1]); chunk.maxZ = Math.max(chunk.maxZ, positions[index * 2 + 1]);
    });
  }
  return { positions, indices, chunks: [...buckets.values()] };
}

export function compileGroundLayout(layout) {
  const stage = (name, task) => { try { return task(); } catch (error) { throw new Error(`${layout.airportCode} ${name}: ${error.message}`, { cause: error }); } };
  const runwayArea = stage('runways', () => unionAreas(layout.runways.map((runway) => pathFootprint(runway.path, runway.width + 2))));
  const apron = stage('aprons', () => subtractAreas(unionAreas(layout.aprons.map((item) => item.area)), runwayArea));
  const taxiway = stage('taxiways', () => subtractAreas(unionAreas(layout.taxiways.map((item) => item.area || pathFootprint(item.path, item.width))), runwayArea, apron));
  const roads = stage('roads', () => subtractAreas(unionAreas((layout.roads || []).map((item) => item.area || pathFootprint(item.path, item.width))), runwayArea, apron, taxiway));
  const operatingArea = stage('operating footprint', () => unionAreas([layout.land || [], runwayArea, apron, taxiway]));
  // Land remains beneath runway strips, at a separate supporting elevation.
  // This also covers small source-to-source runway footprint differences.
  const land = stage('infields', () => subtractInTiles(operatingArea, [apron, taxiway, roads]));
  const surfaces = { land, apron, taxiway, roads };
  const points = operatingArea.flat(2);
  const bounds = {
    minX: Math.min(...points.map((p) => p[0])), maxX: Math.max(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[1])), maxZ: Math.max(...points.map((p) => p[1]))
  };
  return { ...layout, operatingArea, bounds, meshes: Object.fromEntries(Object.entries(surfaces).map(([kind, area]) => [kind, triangulateGround(area)])) };
}

export function normalizeGroundRunways(runways, origin) {
  return runways.filter((runway) => runway?.thresholdStart).map((runway) => {
    let a = projectGroundPoint(runway.thresholdStart.latitude, runway.thresholdStart.longitude, origin);
    let b = runway.thresholdEnd ? projectGroundPoint(runway.thresholdEnd.latitude, runway.thresholdEnd.longitude, origin)
      : [a[0] + Math.sin(runway.heading * DEG) * runway.length, a[1] - Math.cos(runway.heading * DEG) * runway.length];
    if (a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])) [a, b] = [b, a];
    return { path: [a, b], width: Math.max(15, runway.width || 45) };
  }).sort((a, b) => a.path[0][0] - b.path[0][0] || a.path[0][1] - b.path[0][1]);
}

function roundedConnection(a, b, c) {
  const path = [a];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8; const u = 1 - t;
    path.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
  }
  return path;
}

export function createProceduralGround(airportCode, runways, origin) {
  const strips = normalizeGroundRunways(runways, origin);
  const taxiways = []; const aprons = []; const buildings = []; const roads = []; const landAreas = [];
  for (const [stripIndex, strip] of strips.entries()) {
    const [a, b] = strip.path;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / length; const dz = (b[1] - a[1]) / length;
    const at = (s, offset) => [a[0] + dx * s - dz * offset, a[1] + dz * s + dx * offset];
    const width = length < 1400 ? 15 : 23;
    const offset = Math.max(strip.width * 2.4, length < 1400 ? 110 : 190);
    const candidates = [-1, 1].map((side) => {
      const path = [at(70, offset * side), at(length - 70, offset * side)];
      const clearance = Math.min(...strips.filter((other) => other !== strip).map((other) => Math.min(...path.map((point) => distanceToPath(point, other.path) - other.width / 2))), 1e6);
      return { side, path, clearance };
    }).sort((left, right) => right.clearance - left.clearance);
    const { side, path, clearance } = candidates[0];
    landAreas.push(pathFootprint(strip.path, strip.width + 130));
    if (clearance < 70) continue;
    taxiways.push({ path, width, source: 'procedural' });
    for (const fraction of [.08, .32, .68, .92]) {
      const s = length * fraction;
      const connector = roundedConnection(at(s, strip.width / 2 * side), at(s, offset * .75 * side), at(Math.min(length - 70, s + 65), offset * side));
      if (strips.some((other) => other !== strip && connector.some((point) => distanceToPath(point, other.path) < other.width / 2 + width))) continue;
      taxiways.push({ path: connector, width, source: 'procedural' });
    }
    const apronOffset = (offset + 130) * side;
    const apronLength = Math.min(700, length * .38);
    const center = length * .52;
    const apronRing = [at(center - apronLength / 2, (offset - width / 2) * side), at(center + apronLength / 2, (offset - width / 2) * side),
      at(center + apronLength / 2, (offset + 240) * side), at(center - apronLength / 2, (offset + 240) * side)];
    apronRing.push(apronRing[0]);
    if (!strips.some((other) => other !== strip && apronRing.some((point) => distanceToPath(point, other.path) < other.width / 2 + 100))) {
      aprons.push({ area: [[apronRing]], source: 'procedural' });
      for (let i = 0; i < 4; i++) {
        const [x, z] = at(center - apronLength * .32 + i * apronLength * .21, (offset + 210) * side);
        buildings.push({ x, z, width: Math.min(110, apronLength * .18), depth: 45, height: i === 0 ? 22 : 13,
          heading: -Math.atan2(dz, dx), detailed: i !== 0, source: 'procedural' });
      }
      roads.push({ path: [at(center - apronLength / 2, (offset + 270) * side), at(center + apronLength / 2, (offset + 270) * side)], width: 9 });
    }
    landAreas.push(pathFootprint([at(0, apronOffset / 2), at(length, apronOffset / 2)], Math.abs(apronOffset) + 450));
    // Separate runway groups retain their own connected apron instead of false crossings.
    if (stripIndex > 5) break;
  }
  return compileGroundLayout({ schemaVersion: 1, airportCode: canonicalAirportCode(airportCode), source: 'procedural', origin,
    runways: strips, taxiways, aprons, buildings, roads, land: unionAreas(landAreas) });
}
