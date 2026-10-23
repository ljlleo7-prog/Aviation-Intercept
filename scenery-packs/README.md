# Scenery packs v1.0.0

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
| [major-hubs-1.0.0.zip](major-hubs-1.0.0.zip) | 90 | 24.19 MiB |
| [north-america-1.0.0.zip](north-america-1.0.0.zip) | 36 | 9.71 MiB |
| [europe-1.0.0.zip](europe-1.0.0.zip) | 22 | 5.85 MiB |
| [east-asia-1.0.0.zip](east-asia-1.0.0.zip) | 14 | 4.50 MiB |
| [south-southeast-asia-1.0.0.zip](south-southeast-asia-1.0.0.zip) | 5 | 1.31 MiB |
| [middle-east-1.0.0.zip](middle-east-1.0.0.zip) | 3 | 0.70 MiB |
| [oceania-1.0.0.zip](oceania-1.0.0.zip) | 4 | 0.87 MiB |
| [south-america-1.0.0.zip](south-america-1.0.0.zip) | 3 | 0.39 MiB |
| [africa-1.0.0.zip](africa-1.0.0.zip) | 3 | 0.87 MiB |

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
