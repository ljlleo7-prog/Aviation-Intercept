import polygonClipping from 'polygon-clipping';
import { ShapeUtils, Vector2 } from 'three';
import { canonicalAirportCode, projectGroundPoint } from './airportGroundCoordinates.js';
export { canonicalAirportCode, projectGroundPoint, unprojectGroundPoint } from './airportGroundCoordinates.js';

const DEG = Math.PI / 180;
import { distanceToPath } from './airportGroundSurface.js';
export { pointInRing, pointInArea, distanceToPath } from './airportGroundSurface.js';

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
  let valid = areas.filter((area) => area?.length).map(cleanArea).filter((area) => area.length);
  // Large hubs contain hundreds of intersecting taxiway strips. Merge in a
  // balanced tree and re-snap intermediate intersections to avoid unstable
  // sweep-line events from one enormous boolean operation.
  while (valid.length > 1) {
    const next = [];
    for (let i = 0; i < valid.length; i += 2) {
      next.push(i + 1 < valid.length ? cleanArea(polygonClipping.union(valid[i], valid[i + 1])) : valid[i]);
    }
    valid = next;
  }
  return valid[0] || [];
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

function pathsClearance(first, second) {
  let nearest = Math.min(...first.map((point) => distanceToPath(point, second)), ...second.map((point) => distanceToPath(point, first)));
  for (let i = 1; i < first.length && nearest > 0; i++) for (let j = 1; j < second.length; j++) {
    const a = first[i - 1]; const b = first[i]; const c = second[j - 1]; const d = second[j];
    const dx = b[0] - a[0]; const dz = b[1] - a[1]; const ex = d[0] - c[0]; const ez = d[1] - c[1];
    const cross = dx * ez - dz * ex;
    if (Math.abs(cross) < 1e-8) continue;
    const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / cross;
    const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) nearest = 0;
  }
  return nearest;
}

// A straight runway lead-out followed by a quarter turn onto the parallel.
function runwayEntry(at, s, side, offset, runwayWidth, direction, radius) {
  const path = [at(s, (runwayWidth / 2 - 2) * side), at(s, (offset - radius) * side)];
  for (let i = 1; i <= 6; i++) {
    const angle = i / 6 * Math.PI / 2;
    path.push(at(s + direction * radius * (1 - Math.cos(angle)), (offset - radius + radius * Math.sin(angle)) * side));
  }
  return path;
}

function runwayExit(at, s, side, offset, runwayWidth, runout) {
  const controls = [at(s, (runwayWidth / 2 - 2) * side), at(s + runout * .45, (runwayWidth / 2 + offset * .4) * side),
    at(s + runout * .7, offset * side), at(s + runout, offset * side)];
  return Array.from({ length: 9 }, (_, i) => {
    const t = i / 8; const u = 1 - t;
    return [0, 1].map((axis) => u ** 3 * controls[0][axis] + 3 * u * u * t * controls[1][axis]
      + 3 * u * t * t * controls[2][axis] + t ** 3 * controls[3][axis]);
  });
}

export function createProceduralGround(airportCode, runways, origin) {
  const strips = normalizeGroundRunways(runways, origin);
  const taxiways = []; const aprons = []; const buildings = []; const roads = []; const landAreas = [];
  for (const [stripIndex, strip] of strips.entries()) {
    const [a, b] = strip.path;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / length; const dz = (b[1] - a[1]) / length;
    const at = (s, offset) => [a[0] + dx * s - dz * offset, a[1] + dz * s + dx * offset];
    if (length < 150) continue;
    const small = length < 1400;
    const width = small ? 15 : 23;
    const offset = Math.max(strip.width * 2.4, small ? 110 : 190);
    const apronGap = small ? 65 : 100;
    const apronDepth = small ? 120 : 200;
    const apronLength = Math.min(750, length * .32);
    const apronCenter = length * (strips.length === 1 ? .53 : stripIndex % 2 ? .68 : .35);
    const apronStart = apronCenter - apronLength / 2;
    const apronEnd = apronCenter + apronLength / 2;
    const nearOffset = offset + apronGap;
    const farOffset = nearOffset + apronDepth;
    const otherStrips = strips.filter((other) => other !== strip);
    const routeClear = (path, routeWidth = width) => otherStrips.every((other) => pathsClearance(path, other.path) > other.width / 2 + routeWidth / 2 + 25);
    const candidates = [-1, 1].map((side) => {
      const path = [at(15, offset * side), at(length - 15, offset * side)];
      const clearance = Math.min(...otherStrips.map((other) => pathsClearance(path, other.path) - other.width / 2), 1e6);
      const apronRing = [at(apronStart, nearOffset * side), at(apronEnd, nearOffset * side),
        at(apronEnd, farOffset * side), at(apronStart, farOffset * side), at(apronStart, nearOffset * side)];
      const area = [[apronRing]];
      const apronClear = strips.every((other) => !intersectAreas(area, pathFootprint(other.path, other.width + 100)).length)
        && aprons.every((other) => !intersectAreas(area, other.area).length);
      return { side, path, clearance, apronRing, apronClear };
    }).sort((left, right) => Number(routeClear(right.path)) - Number(routeClear(left.path))
      || Number(right.apronClear) - Number(left.apronClear) || right.clearance - left.clearance);
    const { side, path, apronRing, apronClear } = candidates[0];
    landAreas.push(pathFootprint(strip.path, strip.width + 130));
    if (!routeClear(path)) continue;
    const addTaxiway = (route, role) => {
      if (!routeClear(route)) return false;
      taxiways.push({ path: route, width, role, runwayIndex: stripIndex, source: 'procedural' });
      return true;
    };
    addTaxiway(path, 'parallel');
    const radius = small ? 22 : 38;
    const endInset = Math.min(45, length * .07);
    addTaxiway(runwayEntry(at, endInset, side, offset, strip.width, 1, radius), 'runway-entry');
    addTaxiway(runwayEntry(at, length - endInset, side, offset, strip.width, -1, radius), 'runway-entry');
    addTaxiway(runwayEntry(at, length * .32, side, offset, strip.width, 1, radius), 'runway-exit');
    for (const fraction of [.55, .75]) {
      const runout = Math.min(small ? 70 : 190, length * .1);
      addTaxiway(runwayExit(at, length * fraction, side, offset, strip.width, runout), 'runway-exit');
    }
    if (apronClear) {
      const apronLaneOffset = nearOffset + Math.min(55, apronDepth * .3);
      const apronLinks = [.22, .78].map((fraction) => [at(apronStart + apronLength * fraction, offset * side),
        at(apronStart + apronLength * fraction, apronLaneOffset * side)]);
      if (apronLinks.every((link) => routeClear(link))) {
        aprons.push({ area: [[apronRing]], runwayIndex: stripIndex, source: 'procedural' });
        apronLinks.forEach((link) => addTaxiway(link, 'apron-link'));
        addTaxiway([at(apronStart + apronLength * .08, apronLaneOffset * side),
          at(apronEnd - apronLength * .08, apronLaneOffset * side)], 'apron-taxilane');
        for (let i = 0; i < 4; i++) {
          const [x, z] = at(apronStart + apronLength * (.14 + i * .24), (farOffset - 28) * side);
          buildings.push({ x, z, width: Math.min(110, apronLength * .18), depth: 45, height: i === 0 ? 22 : 13,
            heading: -Math.atan2(dz, dx), detailed: i !== 0, source: 'procedural' });
        }
        roads.push({ path: [at(apronStart, (farOffset + 25) * side), at(apronEnd, (farOffset + 25) * side)], width: 9 });
      }
    }
    const landExtent = apronClear ? farOffset + 65 : offset + 75;
    landAreas.push(pathFootprint([at(-40, (landExtent - 100) / 2 * side), at(length + 40, (landExtent - 100) / 2 * side)], landExtent + 100));
    // Separate runway groups retain their own connected apron instead of false crossings.
    if (stripIndex > 5) break;
  }
  return compileGroundLayout({ schemaVersion: 1, airportCode: canonicalAirportCode(airportCode), source: 'procedural', origin,
    runways: strips, taxiways, aprons, buildings, roads, land: unionAreas(landAreas) });
}
