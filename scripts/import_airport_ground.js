import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { compileGroundLayout, groundAlignment, intersectAreas, pathFootprint, pointInArea, projectGroundPoint, unionAreas } from '../src/utils/airportGroundLayout.js';
import { getVisualRunwayGeometry } from '../src/data/visualRunwayCoordinates.js';

const AIRPORTS = {
  KLAX: { latitude: 33.9425, longitude: -118.4081, boundary: 'way(649268639)', bbox: [33.925, -118.46, 33.963, -118.365] },
  VHHH: { latitude: 22.313, longitude: 113.918, boundary: 'relation(16105017)', bbox: [22.275, 113.85, 22.349, 113.958] }
};
const root = fileURLToPath(new URL('../public/scenery/airports/', import.meta.url));
const selected = process.argv.find((arg) => AIRPORTS[arg]);
const offline = process.argv.includes('--offline');
const reuse = process.argv.includes('--reuse');
const endpoints = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];

function closeRing(points) {
  const ring = points.filter((point, i) => !i || Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]) > .1);
  if (ring.length < 3) return null;
  if (Math.hypot(ring[0][0] - ring.at(-1)[0], ring[0][1] - ring.at(-1)[1]) > .1) ring.push(ring[0]);
  return ring;
}

function extractArea(element, origin) {
  const project = (geometry) => geometry?.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).map((p) => projectGroundPoint(p.lat, p.lon, origin));
  if (element.type === 'way') {
    const ring = closeRing(project(element.geometry) || []);
    return ring ? [[ring]] : [];
  }
  const collect = (role) => {
    const pending = (element.members || []).filter((m) => m.type === 'way' && (m.role || 'outer') === role).map((m) => project(m.geometry)).filter((p) => p?.length > 1);
    const rings = [];
    while (pending.length) {
      const path = pending.shift();
      const matches = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < .2;
      while (!matches(path[0], path.at(-1))) {
        const index = pending.findIndex((other) => matches(path.at(-1), other[0]) || matches(path.at(-1), other.at(-1)));
        if (index < 0) break;
        const next = pending.splice(index, 1)[0];
        if (!matches(path.at(-1), next[0])) next.reverse();
        path.push(...next.slice(1));
      }
      if (matches(path[0], path.at(-1))) { const ring = closeRing(path); if (ring) rings.push(ring); }
    }
    return rings;
  };
  const outers = collect('outer'); const holes = collect('inner');
  return outers.map((outer) => [outer, ...holes.filter((hole) => pointInArea(hole[0], [[outer]]))]);
}

function buildingFromArea(area, tags, id) {
  const ring = area[0]?.[0];
  if (!ring) return null;
  let longest = 0; let angle = 0;
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i][0] - ring[i - 1][0]; const dz = ring[i][1] - ring[i - 1][1];
    if (dx * dx + dz * dz > longest) { longest = dx * dx + dz * dz; angle = Math.atan2(dz, dx); }
  }
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  const points = ring.map(([x, z]) => [x * cos + z * sin, -x * sin + z * cos]);
  const minX = Math.min(...points.map((p) => p[0])); const maxX = Math.max(...points.map((p) => p[0]));
  const minZ = Math.min(...points.map((p) => p[1])); const maxZ = Math.max(...points.map((p) => p[1]));
  const x = (minX + maxX) / 2; const z = (minZ + maxZ) / 2;
  return { x: x * cos - z * sin, z: x * sin + z * cos, width: maxX - minX, depth: maxZ - minZ,
    height: Math.min(60, Math.max(4, parseFloat(tags.height) || (parseFloat(tags['building:levels']) || 0) * 3.5 || (tags.aeroway === 'terminal' ? 24 : 12))),
    heading: -angle, detailed: tags.aeroway !== 'terminal', source: id };
}

async function importAirport(code, config) {
  await mkdir(`${root}/sources`, { recursive: true });
  const sourcePath = `${root}/sources/${code}.osm.json`;
  let raw;
  if (offline || reuse) raw = JSON.parse(await readFile(sourcePath, 'utf8'));
  else {
    const bbox = config.bbox.join(',');
    const query = `[out:json][timeout:55];(${config.boundary};nwr["aeroway"](${bbox});way["highway"="service"](${bbox});way["amenity"="parking"](${bbox}););out geom;`;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AviationIntercept-SceneryImporter/1.0' },
          body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(75000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 250)}`);
        raw = await response.json();
        if (!raw.elements?.length || raw.remark) throw new Error(raw.remark || 'Empty source');
        raw.sceneryProvenance = { airportCode: code, endpoint, query, fetchedAt: new Date().toISOString(), licence: 'ODbL-1.0', attribution: '© OpenStreetMap contributors' };
        await writeFile(sourcePath, JSON.stringify(raw));
        break;
      } catch (error) { console.warn(`${code}: ${endpoint}: ${error.message}`); }
    }
    if (!raw) throw new Error(`${code}: no usable source response`);
  }
  if (reuse && !raw.elements.some((e) => e.tags?.aeroway === 'aerodrome' && e.tags?.icao === code)) {
    const query = `[out:json][timeout:30];nwr["aeroway"="aerodrome"](around:15000,${config.latitude},${config.longitude});out geom;`;
    let boundary;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AviationIntercept-SceneryImporter/1.0' },
          body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(45000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
        boundary = await response.json(); break;
      } catch (error) { console.warn(`${code} boundary: ${error.message}`); }
    }
    if (!boundary?.elements?.length) throw new Error(`${code}: boundary unavailable`);
    raw.elements.push(...boundary.elements);
    raw.sceneryProvenance.boundaryQuery = query;
    await writeFile(sourcePath, JSON.stringify(raw));
  }
  raw.elements = [...new Map(raw.elements.map((element) => [`${element.type}/${element.id}`, element])).values()];
  const origin = { latitude: config.latitude, longitude: config.longitude };
  const aerodromes = raw.elements.filter((e) => e.tags?.aeroway === 'aerodrome' && (e.tags.icao === code || e.tags.iata === code.slice(1)));
  let land;
  try { land = unionAreas(aerodromes.map((e) => extractArea(e, origin))); }
  catch (error) { throw new Error(`${code}: invalid airport boundary: ${error.message}`); }
  if (!land.length) throw new Error(`${code}: airport boundary missing; refusing unbounded import`);
  const taxiways = []; const aprons = []; const roads = []; const buildings = []; const runways = []; const rejected = [];
  const relationWays = new Set(raw.elements.filter((e) => e.type === 'relation' && e.tags?.type === 'multipolygon').flatMap((e) => (e.members || []).map((m) => m.ref)));
  for (const element of raw.elements) {
    const tags = element.tags || {}; const id = `${element.type}/${element.id}`;
    if (element.type === 'node' || (element.type === 'way' && relationWays.has(element.id) && !tags.aeroway)) continue;
    const path = element.geometry?.map((p) => projectGroundPoint(p.lat, p.lon, origin));
    if (path?.some((point) => !point.every(Number.isFinite))) { rejected.push(id); continue; }
    try {
      if (tags.aeroway === 'runway' && path?.length > 1 && Math.hypot(path[0][0] - path.at(-1)[0], path[0][1] - path.at(-1)[1]) > 100
        && pointInArea(path[Math.floor(path.length / 2)], land)) {
        runways.push({ path: [path[0], path.at(-1)], width: parseFloat(tags.width) || 45, ref: tags.ref || '', source: id });
      } else if (['taxiway', 'taxilane'].includes(tags.aeroway) && path?.length > 1) {
        const width = Math.min(70, Math.max(8, parseFloat(tags.width) || 23));
        const area = intersectAreas(tags.area === 'yes' ? extractArea(element, origin) : pathFootprint(path, width), land);
        if (area.length) taxiways.push({ path, width, area, source: id });
      } else if (tags.aeroway === 'apron') {
        const area = intersectAreas(extractArea(element, origin), land);
        if (area.length) aprons.push({ area, source: id });
      } else if (tags.highway === 'service' && path?.length > 1) {
        const area = intersectAreas(pathFootprint(path, Math.min(15, parseFloat(tags.width) || 7)), land);
        if (area.length) roads.push({ path, width: 7, area, source: id });
      } else if (tags.amenity === 'parking') {
        const area = intersectAreas(extractArea(element, origin), land);
        if (area.length) roads.push({ area, source: id });
      } else if (!aerodromes.includes(element) && !tags.aerodrome && (tags.building || ['terminal', 'hangar'].includes(tags.aeroway))) {
        const footprint = extractArea(element, origin);
        const building = buildingFromArea(footprint, tags, id);
        if (building && pointInArea([building.x, building.z], land) && building.width > 8 && building.depth > 8
          && building.width < 1500 && building.depth < 1000) buildings.push({ ...building, footprint });
      }
    } catch (error) { rejected.push(`${id}: ${error.message}`); }
  }
  const pathLength = (feature) => (feature.path || []).reduce((length, point, i, path) => length + (i ? Math.hypot(point[0] - path[i - 1][0], point[1] - path[i - 1][1]) : 0), 0);
  // Service roads are background dressing; retain long useful strips rather
  // than thousands of tiny service-access fragments and their infield holes.
  roads.sort((a, b) => pathLength(b) - pathLength(a)); roads.splice(30);
  console.log(`${code}: compiling ${taxiways.length} taxiways, ${aprons.length} aprons and ${roads.length} roads`);
  const layout = compileGroundLayout({ schemaVersion: 1, airportCode: code, source: 'openstreetmap', origin, land, runways, taxiways, aprons, roads,
    buildings: buildings.sort((a, b) => Number(a.detailed) - Number(b.detailed) || b.width * b.depth - a.width * a.depth).slice(0, 100),
    provenance: { ...raw.sceneryProvenance, sourceTimestamp: raw.osm3s?.timestamp_osm_base, sourceFile: `sources/${code}.osm.json`, copyright: 'https://www.openstreetmap.org/copyright' },
    qualityReport: { rejected, taxiways: taxiways.length, aprons: aprons.length, runways: runways.length, buildings: buildings.length } });
  if (taxiways.length < 3 || !aprons.length || !runways.length) throw new Error(`${code}: insufficient layout data`);
  // Footprints have been compiled; retain paths for lightweight marking/light batches.
  layout.taxiways = taxiways.map(({ path, width, source }) => ({ path, width, source }));
  layout.roads = [];
  layout.visualAlignment = groundAlignment(layout, [...new Set(runways.map((runway) => runway.ref.split('/')[0]))]
    .map((end) => getVisualRunwayGeometry(code, end, null)).filter(Boolean));
  if (!layout.visualAlignment.accepted) throw new Error(`${code}: source/runway alignment requires review: ${JSON.stringify(layout.visualAlignment)}`);
  // Distribute the relevant source subset, not neighboring residential data.
  const used = new Set([...taxiways, ...aprons, ...roads, ...runways, ...layout.buildings].map((feature) => feature.source));
  raw.elements = raw.elements.filter((element) => used.has(`${element.type}/${element.id}`) || aerodromes.includes(element));
  await writeFile(sourcePath, JSON.stringify(raw));
  await writeFile(`${root}/${code}.json`, JSON.stringify(layout, (key, value) => {
    if (typeof value !== 'number') return value;
    const precision = key === 'latitude' || key === 'longitude' ? 1e7 : 1000;
    return Math.round(value * precision) / precision;
  }));
  console.log(`${code}: ${JSON.stringify(layout.qualityReport)}, ${Object.values(layout.meshes).reduce((sum, mesh) => sum + mesh.indices.length / 3, 0)} ground triangles`);
  console.log(`${code}: visual alignment ${JSON.stringify(layout.visualAlignment)}`);
}

for (const [code, config] of Object.entries(AIRPORTS)) if (!selected || selected === code) await importAirport(code, config);
