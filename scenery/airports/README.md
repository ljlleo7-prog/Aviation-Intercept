# Airport scenery data

The ten airport JSON layouts and their `sources/*.osm.json` source subsets
contain data © OpenStreetMap contributors, available under the Open Database
License 1.0: https://opendatacommons.org/licenses/odbl/1-0/ .
Attribution and contributor information: https://www.openstreetmap.org/copyright .

These data files are distributed under ODbL 1.0. This data notice does not change
the licence of the application's source code. The distributed source subsets
and derived JSON are available directly alongside this notice. They include
the source timestamp, extraction query, endpoint and feature identifiers.

Published airports: LAX/KLAX, HKG/VHHH, PVG/ZSPD, CAN/ZGGG, PEK/ZBAA,
ATL/KATL, LGA/KLGA, LHR/EGLL, SIN/WSSS, and DXB/OMDB.

The eight new airports use OSM runway endpoints from the same extract as their
taxiways, aprons, land boundary, and terminal footprints. Their generated runway
inventory is in `src/data/sceneryRunways.js`; airport elevations come from the
repository's airport CSV. Runtime airport selection and physics spawn coordinates
use that inventory so the aircraft aligns with the scenery. LAX/HKG retain their
existing local-AIP runway references. OSM source consistency is not independent
survey validation, and these packages are not certified aerodrome charts.

Rebuild the current extracts without network access:

    node scripts/import_airport_ground.js --offline

Refresh one bounded airport extract (maintenance task, not part of a normal build):

    node scripts/import_airport_ground.js KLAX
    node scripts/import_airport_ground.js VHHH
    node scripts/import_airport_ground.js ZSPD

The same command accepts any of the ten ICAO codes above. Large taxiway networks
are merged in a balanced tree with centimetre snapping between boolean operations.
Displaced-threshold extensions are merged into their physical runway strip;
runway path direction is normalized against its end labels and width units are
converted to meters. Generated packages stay below 30,000 ground triangles each.

The importer validates the airport boundary, preserves polygon holes, merges
pavement, clips service roads, limits decorative buildings/roads, and records a
small explicit visual alignment to the application's existing runway references.
Original source coordinates remain in the distributed extract. These visual
layouts are not operational taxi guidance or certified aerodrome mapping.

Airports without a published package use a continuous parallel taxiway with
entries near both runway ends and several intermediate exits. Two separate
links lead from that backbone to a set-back apron and its apron taxilane;
terminal/hangar buildings sit along the rear apron edge. Small fields use the
same hierarchy at reduced scale. Routes that would obstruct another runway
are omitted. Coincident airport-reference runway estimates are separated once
and shared by runway rendering and ground generation, so connections remain
aligned with the displayed pavement. Surveyed coordinates are preserved.

Building footprints are retained; missing building heights and taxiway widths
use representative visual defaults. Source boundary features are excluded from
building generation even if their tags incorrectly include `building=yes`.

No satellite imagery, external map tiles, runtime Overpass requests, or API keys
are used. Public extraction services can be unavailable; a failed refresh leaves
the existing published package intact.

The exported ground surfaces currently contain about 15,000 triangles at KLAX
and 22,000 at VHHH, batched into at most four visible ground-surface draws.
Nearby markings and taxiway lights add two shared batches. Ground geometry is
identical in Balanced and Economy; secondary detail and building density differ.
Passed render chunks are released, and airport resources are released on teardown.

Both profiles are bounded: Balanced caps the outside view at 30 fps and 420,000
render pixels; Economy caps it at 20 fps and 200,000 pixels. Runway markings are
batched per runway, unchanged frames are skipped, and hidden/offscreen views stop
their animation scheduling. These limits apply to the scenery, not flight physics.

Review the live renderer in isolation at `/previews/airport-ground-demo.html`
using the Vite development server. The preview seeds flat terrain solely to
isolate ground-layout review from the elevation API; the actual flight view
continues to use the existing radar data.
