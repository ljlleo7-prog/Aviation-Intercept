import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compileGroundLayout, groundAlignment, intersectAreas, pathFootprint, pointInArea, projectGroundPoint, unionAreas } from '../src/utils/airportGroundLayout.js';
import { getVisualRunwayGeometry } from '../src/data/visualRunwayCoordinates.js';
import { validateImportedLayout, validateSceneryReference } from '../src/services/sceneryPackParser.js';

let AIRPORTS = {
  KLAX: { latitude: 33.9425, longitude: -118.4081, boundary: 'way(649268639)', bbox: [33.925, -118.46, 33.963, -118.365] },
  VHHH: { latitude: 22.313, longitude: 113.918, boundary: 'relation(16105017)', bbox: [22.275, 113.85, 22.349, 113.958] },
  ZSPD: { latitude: 31.1434, longitude: 121.805, elevation: 13, bbox: [31.105, 121.755, 31.19, 121.855] },
  ZGGG: { latitude: 23.392401, longitude: 113.299004, elevation: 50, bbox: [23.34, 113.25, 23.435, 113.345] },
  ZBAA: { latitude: 40.077349, longitude: 116.596702, elevation: 116, bbox: [40.035, 116.54, 40.12, 116.64] },
  KATL: { latitude: 33.6367, longitude: -84.428101, elevation: 1026, bbox: [33.605, -84.46, 33.665, -84.39] },
  KLGA: { latitude: 40.777199, longitude: -73.872597, elevation: 21, bbox: [40.755, -73.9, 40.798, -73.845] },
  EGLL: { latitude: 51.470748, longitude: -0.459909, elevation: 83, bbox: [51.445, -0.505, 51.49, -0.415] },
  WSSS: { latitude: 1.35019, longitude: 103.994003, elevation: 22, bbox: [1.295, 103.96, 1.405, 104.045] },
  OMDB: { latitude: 25.24979, longitude: 55.370992, elevation: 62, bbox: [25.22, 55.325, 25.285, 55.415] }
};
const optional = process.argv.includes('--optional');
if (optional) AIRPORTS = JSON.parse(await readFile(new URL('./scenery_airports_v1.json', import.meta.url), 'utf8'));
const root = fileURLToPath(new URL(optional ? '../scenery-source/airports/' : '../public/scenery/airports/', import.meta.url));
const selected = process.argv.find((arg) => AIRPORTS[arg]);
const offline = process.argv.includes('--offline');
const execFileAsync = promisify(execFile);
const reuse = process.argv.includes('--reuse');
const endpoints = optional && !process.argv.includes('--main-mirror')
  ? ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
  : ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

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
  if (optional && process.argv.includes('--resume')) {
    try { raw = JSON.parse(await readFile(sourcePath, 'utf8')); } catch { /* No local extract yet. */ }
  }
  if (offline || reuse) raw = JSON.parse(await readFile(sourcePath, 'utf8'));
  else if (!raw) {
    const bbox = config.bbox.join(',');
    const boundary = config.boundary || `nwr["aeroway"="aerodrome"]["icao"="${code}"](${bbox})`;
    const dressing = config.boundary ? `way["highway"="service"](${bbox});way["amenity"="parking"](${bbox});` : '';
    const query = `[out:json][timeout:${optional ? 10 : 25}][maxsize:67108864];(${boundary};way["aeroway"](${bbox});${dressing});out geom;`;
    for (const endpoint of endpoints) {
      try {
        if (process.argv.includes('--curl')) {
          const { stdout } = await execFileAsync('curl', ['--max-time', '90', '--silent', '--show-error', '--fail',
            '--user-agent', 'AviationIntercept-SceneryImporter/1.0', '--data-urlencode', `data=${query}`, endpoint], { maxBuffer: 64 * 1024 * 1024 });
          raw = JSON.parse(stdout);
        } else {
          const response = await fetch(optional ? endpoint : `${endpoint}?${new URLSearchParams({ data: query })}`, {
            ...(optional ? { method: 'POST', body: new URLSearchParams({ data: query }) } : {}),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AviationIntercept-SceneryImporter/1.0 (offline airport scenery; OpenStreetMap attribution retained)' },
            signal: AbortSignal.timeout(optional ? 35000 : 75000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 250)}`);
          raw = await response.json();
        }
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
        const parsedWidth = parseFloat(tags.width) || 45;
        // Some OSM US runway widths omit units while retaining feet (e.g. IAH 150).
        const width = parsedWidth * (/ft|feet|'/i.test(tags.width || '') || parsedWidth > 100 ? .3048 : 1);
        runways.push({ path: [path[0], path.at(-1)], width, ref: tags.ref || '', source: id });
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
  // OSM may split one physical runway into a main strip and threshold
  // extensions (and sometimes tag the whole strip as an extension). Preserve
  // their full span, but publish exactly one runway for each pair of labels.
  const groups = new Map();
  for (const runway of runways) {
    const group = groups.get(runway.ref) || [];
    group.push(runway); groups.set(runway.ref, group);
  }
  runways.length = 0;
  for (const segments of groups.values()) {
    const main = segments.reduce((longest, segment) =>
      Math.hypot(...segment.path[1].map((value, i) => value - segment.path[0][i])) >
      Math.hypot(...longest.path[1].map((value, i) => value - longest.path[0][i])) ? segment : longest);
    const axis = main.path[1].map((value, i) => value - main.path[0][i]);
    const points = segments.flatMap(segment => segment.path).sort((a, b) => (a[0] - b[0]) * axis[0] + (a[1] - b[1]) * axis[1]);
    runways.push({ ...main, path: [points[0], points.at(-1)], sourceSegments: segments.map(segment => segment.source) });
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
  const sourcedReferences = runways.filter(runway => /^\d{2}[LCR]?\/\d{2}[LCR]?$/.test(runway.ref)).map(runway => {
    const toGeo = ([x, z]) => ({ latitude: origin.latitude - z / 111320,
      longitude: origin.longitude + x / (111320 * Math.cos(origin.latitude * Math.PI / 180)), elevation: config.elevation || 0 });
    return { runwayName: runway.ref.split('/')[0], thresholdStart: toGeo(runway.path[0]), thresholdEnd: toGeo(runway.path[1]) };
  });
  const existingReferences = [...new Set(runways.map(runway => runway.ref.split('/')[0]))]
    .map(end => getVisualRunwayGeometry(code, end, null)).filter(Boolean);
  layout.visualAlignment = groundAlignment(layout, existingReferences.length ? existingReferences : sourcedReferences);
  if (!layout.visualAlignment.accepted) throw new Error(`${code}: source/runway alignment requires review: ${JSON.stringify(layout.visualAlignment)}`);
  if (!existingReferences.some(runway => runway.geometrySource === 'local-aip')) {
    layout.visualAlignment.reason = 'Ground and runway endpoints share OSM source coordinates; this is source consistency, not independent survey validation';
  }
  // Distribute the relevant source subset, not neighboring residential data.
  const used = new Set([...taxiways, ...aprons, ...roads, ...runways, ...layout.buildings].map((feature) => feature.source));
  raw.elements = raw.elements.filter((element) => used.has(`${element.type}/${element.id}`) || aerodromes.includes(element)
    || element.tags?.aeroway === 'runway');
  await writeFile(sourcePath, JSON.stringify(raw));
  await writeFile(`${root}/${code}.json`, JSON.stringify(layout, (key, value) => {
    if (typeof value !== 'number') return value;
    const precision = key === 'latitude' || key === 'longitude' ? 1e7 : 1000;
    return Math.round(value * precision) / precision;
  }));
  if (!['KLAX', 'VHHH'].includes(code)) {
    const referencesPath = new URL(optional ? `../scenery-source/airports/${code}.reference.json` : '../src/data/sceneryRunways.js', import.meta.url);
    let references = {};
    try { references = JSON.parse((await readFile(referencesPath, 'utf8')).replace(/^export default\s*/, '').replace(/;\s*$/, '')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const airportInfo = optional ? [config.iata, config.name] : {
      ZSPD: ['PVG', 'Shanghai Pudong International Airport'], ZGGG: ['CAN', 'Guangzhou Baiyun International Airport'],
      ZBAA: ['PEK', 'Beijing Capital International Airport'], KATL: ['ATL', 'Hartsfield Jackson Atlanta International Airport'],
      KLGA: ['LGA', 'LaGuardia Airport'], EGLL: ['LHR', 'London Heathrow Airport'],
      WSSS: ['SIN', 'Singapore Changi Airport'], OMDB: ['DXB', 'Dubai International Airport']
    }[code];
    references[code] = { airport: { icao: code, iata: airportInfo[0], name: airportInfo[1], ...origin, elevation: config.elevation, type: 'normal' },
      provenance: layout.provenance, runways: runways.filter(runway => /^\d{2}[LCR]?\/\d{2}[LCR]?$/.test(runway.ref)).map(runway => {
      const [first, second] = runway.ref.split('/');
      let [start, end] = runway.path;
      // OSM ways may run in either direction; attach the first label to its approach end.
      const heading = Math.atan2(end[0] - start[0], -(end[1] - start[1]));
      if (Math.cos(heading - Number(first.slice(0, 2)) * 10 * Math.PI / 180) < 0) [start, end] = [end, start];
      const latitude = z => origin.latitude - z / 111320;
      const longitude = x => origin.longitude + x / (111320 * Math.cos(origin.latitude * Math.PI / 180));
      return [first, second, latitude(start[1]), longitude(start[0]), latitude(end[1]), longitude(end[0]),
        Math.hypot(end[0] - start[0], end[1] - start[1]) / .3048, runway.width / .3048, config.elevation || 0];
    }) };
    await writeFile(referencesPath, (optional ? '' : 'export default ') + JSON.stringify(references, null, 2) + (optional ? '\n' : ';\n'));
  }
  console.log(`${code}: ${JSON.stringify(layout.qualityReport)}, ${Object.values(layout.meshes).reduce((sum, mesh) => sum + mesh.indices.length / 3, 0)} ground triangles`);
  console.log(`${code}: visual alignment ${JSON.stringify(layout.visualAlignment)}`);
}

for (const [code, config] of (process.argv.includes('--reverse') ? Object.entries(AIRPORTS).reverse() : Object.entries(AIRPORTS))) {
  if (selected && selected !== code) continue;
  if (optional && ['KLAX', 'VHHH', 'ZSPD', 'ZGGG', 'ZBAA', 'KATL', 'KLGA', 'EGLL', 'WSSS', 'OMDB'].includes(code)) continue;
  if (optional && process.argv.includes('--resume')) {
    try {
      const layout = JSON.parse(await readFile(`${root}/${code}.json`, 'utf8'));
      const references = JSON.parse(await readFile(`${root}/${code}.reference.json`, 'utf8'));
      if (validateImportedLayout(layout, code) && validateSceneryReference(references[code], code, layout)) {
        console.log(`${code}: already compiled`); continue;
      }
    } catch { /* Fetch or rebuild missing/incomplete airports. */ }
  }
  try { await importAirport(code, config); }
  catch (error) { if (!optional) throw error; console.error(`${code}: FAILED: ${error.message}`); }
}
