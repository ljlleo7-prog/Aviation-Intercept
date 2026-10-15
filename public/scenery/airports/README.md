# Airport scenery data

The KLAX and VHHH JSON layouts and their `sources/*.osm.json` source subsets
contain data © OpenStreetMap contributors, available under the Open Database
License 1.0: https://opendatacommons.org/licenses/odbl/1-0/ .
Attribution and contributor information: https://www.openstreetmap.org/copyright .

These data files are distributed under ODbL 1.0. This data notice does not change
the licence of the application's source code. The distributed source subsets
and derived JSON are available directly alongside this notice. They include
the source timestamp, extraction query, endpoint and feature identifiers.

Rebuild the current extracts without network access:

    node scripts/import_airport_ground.js --offline

Refresh one bounded airport extract (maintenance task, not part of a normal build):

    node scripts/import_airport_ground.js KLAX
    node scripts/import_airport_ground.js VHHH

The importer validates the airport boundary, preserves polygon holes, merges
pavement, clips service roads, limits decorative buildings/roads, and records a
small explicit visual alignment to the application's existing runway references.
Original source coordinates remain in the distributed extract. These visual
layouts are not operational taxi guidance or certified aerodrome mapping.

Building footprints are retained; missing building heights and taxiway widths
use representative visual defaults. Source boundary features are excluded from
building generation even if their tags incorrectly include `building=yes`.

No satellite imagery, external map tiles, runtime Overpass requests, or API keys
are used. Public extraction services can be unavailable; a failed refresh leaves
the existing published package intact.
