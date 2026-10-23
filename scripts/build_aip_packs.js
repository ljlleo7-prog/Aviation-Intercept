import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
import { parseCsv } from '../src/utils/csv.js';
import { AIP_SOURCE_FILES, parseAipPack } from '../src/services/aipPackImport.js';

const source = new URL('../AIP_DATA/supabase_csv/', import.meta.url);
const output = new URL('../aip-packs/', import.meta.url);
const sourceBytes = async name => {
  try { return await readFile(new URL(`source-overrides/${name}`, output)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return readFile(new URL(name, source)); }
};
const rows = async name => parseCsv((await sourceBytes(name)).toString('utf8'));
const numeric = value => value === '' || value == null ? null : Number(value);
const [airportRows, runwayRows, frequencyRows, navaidRows] = await Promise.all(
  ['aip_airports.csv', 'aip_runways.csv', 'aip_frequencies.csv', 'aip_navaids.csv'].map(rows));
const airports = airportRows.map(row => ({
  icao: row.icao_code || row.gps_code || row.ident, iata: row.iata_code || '', ident: row.ident,
  name: row.name, type: row.type, city: row.municipality, country: row.iso_country,
  latitude: numeric(row.latitude_deg), longitude: numeric(row.longitude_deg), elevation: numeric(row.elevation_ft),
  runways: [], frequencies: []
})).filter(airport => Number.isFinite(airport.latitude) && Number.isFinite(airport.longitude));
const byIdent = new Map(airports.map(airport => [airport.ident, airport]));
for (const row of runwayRows) {
  if (row.closed === '1') continue;
  byIdent.get(row.airport_ident)?.runways.push({
    name: [row.le_ident, row.he_ident].filter(Boolean).join('/'), length: numeric(row.length_ft), width: numeric(row.width_ft),
    surface: row.surface, bearing: numeric(row.le_heading_degT),
    startLatitude: numeric(row.le_latitude_deg), startLongitude: numeric(row.le_longitude_deg),
    endLatitude: numeric(row.he_latitude_deg), endLongitude: numeric(row.he_longitude_deg)
  });
}
for (const row of frequencyRows) byIdent.get(row.airport_ident)?.frequencies.push({
  type: row.type, description: row.description, frequency: numeric(row.frequency_mhz)
});
const navaids = navaidRows.map(row => ({
  identifier: row.ident, name: row.name, type: row.type, latitude: numeric(row.latitude_deg), longitude: numeric(row.longitude_deg),
  frequencyKhz: numeric(row.frequency_khz), dmeFrequencyKhz: numeric(row.dme_frequency_khz),
  dmeChannel: row.dme_channel, associatedAirport: row.associated_airport, isoCountry: row.iso_country
})).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
const files = { 'airports.json': strToU8(JSON.stringify(airports)), 'navaids.json': strToU8(JSON.stringify(navaids)) };
for (const file of AIP_SOURCE_FILES) files[file] = new Uint8Array(await sourceBytes(file));
const sourceTables = Object.fromEntries(AIP_SOURCE_FILES.map(name => [name, {
  table: `skylinetragedy_${name.replace('.csv', '')}`, rows: parseCsv(new TextDecoder().decode(files[name])).length, bytes: files[name].length
}]));
const manifest = {
  schemaVersion: 1, id: 'world-aip', name: 'World AIP airports and routes', version: '1.1.0', coverage: 'world',
  sourceTables,
  source: 'AIP_DATA/supabase_csv plus live Supabase catalog/source snapshots from 2026-10-21',
  files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')]))
};
files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
files['NOTICE.txt'] = strToU8('Built from repository AIP_DATA/supabase_csv exports. Airport, runway, frequency and navaid source: OurAirports (public domain). Route sources and cycle metadata are preserved in the route CSV files. For simulation use.\n');
const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { mtime: new Date(2026, 0, 1) }]])), { level: 6 });
await parseAipPack(zip);
await mkdir(output, { recursive: true });
const filename = 'world-aip-1.1.0.zip';
await writeFile(new URL(filename, output), zip);
await writeFile(new URL('catalog.json', output), JSON.stringify([{ file: filename, name: manifest.name, version: manifest.version,
  bytes: zip.length, sourceTables, airports: airports.length, navaids: navaids.length, sha256: createHash('sha256').update(zip).digest('hex') }], null, 2) + '\n');
console.log(`${filename}: ${airports.length} airports, ${navaids.length} navaids, ${(zip.length / 1048576).toFixed(2)} MiB`);
