import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { parseSceneryPack } from '../src/services/sceneryPackParser.js';

const bundled = new Set(['KLAX', 'VHHH', 'ZSPD', 'ZGGG', 'ZBAA', 'KATL', 'KLGA', 'EGLL', 'WSSS', 'OMDB']);
const config = JSON.parse(await readFile(new URL('./scenery_airports_v1.json', import.meta.url), 'utf8'));
const root = new URL('../scenery-source/airports/', import.meta.url);
const output = new URL('../scenery-packs/', import.meta.url);
const groups = new Map();
const titles = { 'north-america': 'North America', 'south-america': 'South America', europe: 'Europe', africa: 'Africa', oceania: 'Oceania', 'middle-east': 'Middle East', 'east-asia': 'East Asia', 'south-southeast-asia': 'South & Southeast Asia' };
for (const [code, airport] of Object.entries(config)) {
  if (bundled.has(code)) continue;
  if (!groups.has(airport.region)) groups.set(airport.region, []);
  groups.get(airport.region).push(code);
}
// Release ZIPs retain enough source data to reconstruct ignored build staging offline.
try {
  const required = [...groups.values()].flat().flatMap(code => [`${code}.json`, `${code}.reference.json`, `sources/${code}.osm.json`]);
  await Promise.all(required.map(file => access(new URL(file, root))));
}
catch {
  const release = new Uint8Array(await readFile(new URL('major-hubs-1.0.0.zip', output)));
  await parseSceneryPack(release);
  const files = unzipSync(release);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  await mkdir(new URL('sources/', root), { recursive: true });
  for (const entry of manifest.airports) {
    await writeFile(new URL(`${entry.code}.json`, root), files[entry.file]);
    await writeFile(new URL(`sources/${entry.code}.osm.json`, root), files[`sources/${entry.code}.osm.json`]);
    await writeFile(new URL(`${entry.code}.reference.json`, root), JSON.stringify({ [entry.code]: entry.reference }, null, 2));
  }
}
const regions = [['major-hubs', 'World Airports', [...groups.values()].flat()], ...[...groups].map(([region, codes]) => [region, titles[region], codes])];
await mkdir(output, { recursive: true });
const notice = strToU8('Scenery data © OpenStreetMap contributors, licensed under ODbL 1.0.\nhttps://www.openstreetmap.org/copyright\nhttps://opendatacommons.org/licenses/odbl/1-0/\nThis archive includes derived airport layouts and the corresponding OSM source subsets under sources/.\nEach layout records extraction provenance and timestamps.\nThese visual layouts are not certified aerodrome charts or operational taxi guidance.\n');
const catalog = [];
for (const [id, name, codes] of regions) {
  const files = { 'LICENSE.txt': notice }; const airports = [];
  for (const code of codes) {
    const file = `airports/${code}.json`;
    files[file] = await readFile(new URL(`${code}.json`, root));
    files[`sources/${code}.osm.json`] = await readFile(new URL(`sources/${code}.osm.json`, root));
    const references = JSON.parse(await readFile(new URL(`${code}.reference.json`, root), 'utf8'));
    airports.push({ code, file, reference: references[code], sha256: createHash('sha256').update(files[file]).digest('hex') });
  }
  const manifest = { schemaVersion: 1, compatibility: 'airport-ground-v1', id, name, version: '1.0.0', licence: 'ODbL-1.0', airports };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([key, data]) => [key, [data, { mtime: new Date(2026, 0, 1) }]])), { level: 6 });
  await parseSceneryPack(zip);
  const filename = `${id}-1.0.0.zip`;
  await writeFile(new URL(filename, output), zip);
  catalog.push({ file: filename, name, version: '1.0.0', airports: codes, bytes: zip.length, sha256: createHash('sha256').update(zip).digest('hex') });
  console.log(`${filename}: ${zip.length} bytes (${codes.length} additional airports)`);
}
await writeFile(new URL('catalog.json', output), JSON.stringify(catalog, null, 2) + '\n');

const coverage = { version: '1.0.0', bundledAirports: [...bundled], optionalAirports: Object.entries(config).filter(([code]) => !bundled.has(code)).map(([icao, airport]) => ({ icao, iata: airport.iata, name: airport.name, region: airport.region })), totalAirports: Object.keys(config).length };
await writeFile(new URL('coverage.json', output), JSON.stringify(coverage, null, 2) + '\n');
const rows = catalog.map(pack => `| [${pack.file}](${pack.file}) | ${pack.airports.length} | ${(pack.bytes / 1048576).toFixed(2)} MiB |`).join('\n');
await writeFile(new URL('README.md', output), `# Scenery packs v1.0.0

These packs add **90 airports** to the **10 bundled defaults**, for **100 airports**
with sourced scenery. They cover 78 of the 82 distinct normal airports in the
existing selection database, plus other major airports. Existing airport types
(normal or emergency) are preserved. Newly registered airports become searchable
after installation and reload.

Download one ZIP from the external hosting site, then open **Settings → Scenery
packs → Import scenery ZIP**. Keep the ZIP intact. Reload the simulator after
importing or removing packs. Installed packs work offline when the app itself
is available; clearing browser site data removes them.

Choose the combined World Airports pack or the regions you need. Every ZIP below
contains additional airports only; bundled defaults are excluded.

| ZIP | Additional airports | Download size |
| --- | ---: | ---: |
${rows}

The combined pack and regional packs overlap intentionally. The highest version
wins for each airport, with ascending pack ID as a stable tie breaker. Reimporting
the same pack replaces it atomically; downgrades are rejected. Removing a pack
restores another installed pack or generated/bundled fallback after reload.

See [coverage.json](coverage.json) for all ICAO/IATA codes and airport names,
and [catalog.json](catalog.json) for release byte counts and SHA-256 hashes.

## Hosting and rebuilding

Upload the ZIPs to any external download site. Manual import needs no CORS setup
or download-host configuration. This directory and ignored scenery-source build
staging live outside public, so optional scenery is excluded from app deployment.

Run npm run build:scenery-packs to rebuild locally. On a fresh checkout it restores
the required source staging from the existing combined release ZIP without network
access. All release archives use fixed timestamps and pass the actual importer
before being written. Run npm run test:scenery-import for regression checks.

To fetch missing source layouts, run npm run fetch:scenery-packs (network required).
To refresh one airport, run node scripts/import_airport_ground.js --optional KJFK.
The extraction configuration is scripts/scenery_airports_v1.json. Public extraction
services can time out; completed airport data is retained for subsequent runs.

## Pack format

ZIP root: manifest.json, LICENSE.txt, airports/ICAO.json, sources/ICAO.osm.json.
The manifest has schemaVersion 1, compatibility airport-ground-v1, a stable ID,
name, numeric major.minor.patch version, ODbL-1.0 licence, and airport entries.
Each entry has code, file, SHA-256 hash and runway reference metadata. The latter
registers airport details and paired runway endpoints before selection/physics start.
Scenery and runway references activate together on reload.

Limits: 128 MiB compressed, 384 MiB expanded, 16 MiB per entry, 512 entries.
The importer checks archive structure, CRCs, layout hashes, supported versions,
renderer geometry, and runway labels/endpoints/widths/lengths. Invalid or incomplete
archives and storage failures leave existing packs intact. Decompression runs in a
worker; airport geometry is read from browser storage only when needed.

This format supports the 100-airport catalog. To extend coverage, update both
configuration files, fetch the additional source layouts, then rebuild packs.
ZIP64, encrypted ZIPs, duplicate entries and unsafe paths are unsupported.

Scenery data © OpenStreetMap contributors, ODbL 1.0. Each ZIP retains the relevant
OSM source subsets and extraction provenance. Runway and ground coordinates share
an OSM source; that is source consistency rather than independent survey validation.
These visual layouts are not certified aerodrome charts or operational taxi guidance.

https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/
`);
