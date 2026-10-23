# 2.0 airport ground visuals

Status: design with an implemented initial ground layer. Researched 15 October 2026.

Implementation checkpoint: local OSM packages now cover KLAX and VHHH, with procedural fallback elsewhere, shared surface batches, building footprints and nearby taxiway markings/lights. See [the distributed data notice and rebuild instructions](../public/scenery/airports/README.md). Balanced now caps the outside view at 30 fps/420,000 pixels and Economy at 20 fps/200,000 pixels in response to actual machine load. Unchanged frames are skipped and hidden/offscreen views stop scheduling. Detailed budgets and later phases below remain design targets, not claims that every target has been met.

This extends [the outside-visuals plan](V2_OUTSIDE_VISUALS_PLAN.md). It replaces the earlier restriction against decorative taxiway networks. Ground visuals remain separate from taxi instructions, collision surfaces and scoring.

## Recommended approach

Use **preprocessed airport layouts, with deterministic procedural fallback**. Import reusable ground geometry from OpenStreetMap initially; prefer usable official airport mapping when its coverage, currency and reuse terms have been checked. Ship compact airport packages from our own static assets. No map service needs to answer requests during flight.

The largest visual improvement should come from a convincing distribution of surfaces: connected taxiways, aprons, terminal forecourts, service roads, parking areas, varied infields and real shoreline boundaries. Most of this can be flat geometry or material masks. It does not require more terrain subdivisions or a city model.

Balanced and Economy must show the same runways, taxiway routes, apron outlines and land/water boundaries. Economy reduces texture resolution, markings, lights beyond useful range and decorative objects. Changing quality must never make pavement turn into grass.

## Current implementation and gaps

- `OutsideFlightScene.jsx` draws runway strips, a coarse radar terrain surface and a broad base plane. Its airport terrain blend is based mainly on the selected runway corridor.
- `outsideAirportVisuals.js` adds instanced buildings and representative runway/approach/PAPI lighting. Building positions are generated independently of any apron or service-road layout.
- `outsideAirportScenery.js` prevents buildings from blocking runway corridors, but has no taxiway or apron model.
- `OutsideFlightView.jsx` chooses the nearer departure/arrival and a runway end. A change in selected runway can rebuild the scene. Airport ground layout must instead have a stable airport identity and coordinate frame.
- Some fallback runways are synthesized from airport reference points. Even the local visual override uses a runway-number heading rather than deriving its bearing from threshold coordinates. Imported ground geometry needs an alignment check before it can connect to those strips.

This explains why adding buildings alone still leaves a large, uniform grass field.

## Data sources and selection

| Source | Intended role | Limits and decision |
| --- | --- | --- |
| Existing AIP/runway data | Operational runway placement, dimensions and elevation where actually supplied | Preserve surveyed versus synthesized status. A runway identifier is not a surveyed true bearing. |
| OpenStreetMap vectors | Initial global source for airport boundaries, taxiway paths, apron polygons, terminal/hangar footprints, service roads and nearby land cover | Community coverage varies. Validate each airport package; do not assume a mapped airport has a complete connected network. |
| FAA AIS airport-mapping GIS | Preferred US ground geometry when a current, usable airport dataset exists | Published feature classes include taxiways, aprons and buildings. The initial release had limited airports; current KLAX coverage still needs checking. |
| Other aviation-authority or airport GIS | Optional airport-specific adapter | Check downloadable geometry, coordinate reference, date and redistribution terms before adding a source. Publicly viewable charts are not automatically reusable vector data. |
| Procedural layout | Immediate offline fallback, or conservative completion of an explicitly missing region | Decorative, repeatable geometry; do not invent real taxiway names, gates, holding clearances or ATC routes. |

OSM documents `aeroway=taxiway` as a path, `aeroway=apron` as an area, and terminal/hangar features. Width and surface tags can help but may be missing. Support polygons with holes and multipolygon relations, not just individual closed ways. See [OSM aeroway tagging](https://wiki.openstreetmap.org/wiki/Aeroway).

The FAA announced its airport-diagram GIS release in 2025 and lists taxiway, apron, building and runway feature classes. Treat availability airport by airport; do not describe this as global coverage. See the [FAA release notice](https://www.faa.gov/air_traffic/flight_info/aeronav/safety_alerts/media/ADDS_25-01_DPN_Open_Data_Release.pdf) and [AIS data dictionary](https://aeronav.faa.gov/Open_Data_Supp/Data_Dictionary.pdf).

### Acquisition and provenance

1. Resolve airport identity using ICAO/IATA plus location; prefer an airport boundary/site relation over an unrestricted radius search. Use a bounded local search only when no boundary exists. Expand to include all matched runway ends and airport-owned apron areas without absorbing a neighboring airport.
2. For a small pilot set, acquire OSM features with a bounded Overpass query. For broader coverage, use regional extracts and an offline importer. Keep acquisition in a maintenance script, outside browser rendering and ordinary production builds.
3. Store source ID, source timestamp/effective date, licence, importer/schema version and per-feature provenance. Preserve original vectors or provide a documented reproducible download/source route alongside distributed derived data as appropriate.
4. Produce a review report: runway alignment, missing widths, disconnected paths, invalid rings, water conflicts and imported versus generated feature counts. Reject an invalid airport package without blocking the application build.
5. Publish a manifest and compressed versioned per-airport assets. An unavailable or rejected package selects the same seeded fallback every time.

Overpass is a read-only extraction service with instance-specific limits; it should not become a per-player runtime dependency. The core OSM editing API is unsuitable for this job. See [Overpass documentation](https://wiki.openstreetmap.org/wiki/Overpass_API) and [OSMF API policy](https://operations.osmfoundation.org/policies/api/).

Include visible OSM attribution when displaying OSM-derived scenery, and carry the ODbL notice and required database/source availability through the export process. Keep source licensing metadata with the package, including official-source terms. Use the [OSM copyright page](https://www.openstreetmap.org/copyright) and [OSMF attribution guidance](https://osmfoundation.org/wiki/Attribution_Guidelines) when preparing distribution. No third-party satellite imagery is needed.

## A single normalized airport model

Use a fixed airport-local east/north frame in metres, with a declared WGS84 origin. Active-runway selection changes highlighting and approach aids, not the airport layout. Camera-relative rebasing remains a render transform.

Conceptual package:

```text
AirportGroundPackage
  airportId, schemaVersion, sourceRevision, originWgs84
  sources[]: provider, featureIds, fetchedAt, effectiveDate, licence, attribution
  runwayReferences[]: ends, thresholdCoordinates, dimensions, geometryConfidence
  airportBoundary, landPolygons, waterPolygons
  taxiways[]: path or footprint, widthM, surface, source, inferredFields
  aprons[]: polygonWithHoles, surface, source
  buildings[]: footprint, type, heightM?, source
  serviceRoads[], parkingAreas[], infieldRegions[]
  groundHeightModel: referenceElevationMslM, footprint, blendBoundary
  renderChunks[]: bounds, pavement, materialMasks, marking/lightInstances
  qualityReport: complete | partial | procedural, rejectedFeatures, alignmentError
```

Choose a coherent provider per feature family, with explicit overrides. Do not draw duplicate official and OSM taxiway surfaces together. Prefer source footprints when available; buffer centerlines only where footprints are absent. Inferred widths remain tagged as inferred.

Before import acceptance, match runway ends, compare threshold separation, true bearing and dimensions, and check all parallel strips. Initial review thresholds can be 30 m endpoint discrepancy or 1 degree heading discrepancy; these are proposed investigation triggers, not tolerances for silently moving real data. Correct coordinate/datum/unit errors first. Do not rotate the entire airport to fit a rounded runway number. Where runway placement is only synthetic, flag the mismatch and use a coherent approximate layout rather than attaching surveyed taxiways to a misplaced strip. Retain operational physics references until any separate alignment change is validated.

## Ground composition and geometry

Build or preprocess a plan view first, then generate the render meshes:

1. **Land and shoreline:** a valid airport land footprint, water boundaries and a small transition into surrounding land cover. Preserve reclaimed-airport shapes such as VHHH. Never infer dry land from zero elevation alone.
2. **Pavement:** asphalt taxiway corridors, concrete apron polygons, shoulders and optional blast pads supported by source data. Buffer taxiway paths into surfaces with bounded rounded joins and junction fillets; union overlapping surfaces offline to avoid seams and flicker. Preserve apron holes and grass islands.
3. **Connections:** mapped runway exits and apron entrances meet their respective surfaces. Clean duplicate points and tiny gaps conservatively; do not snap across a runway, water body or unrelated parallel taxiway just because endpoints are near.
4. **Ground detail:** broad asphalt repairs, concrete slab seams, rubber wear, drainage strips and restrained grass/soil variation. Use a small reusable material atlas and world-scaled detail texture; prevent giant blurry stretched patches and obvious repetitive stripes.
5. **Markings:** yellow taxiway centerlines, apron stand leads and holding markings where source or the named visual fallback supports them. Generate smooth paths without excessive curve segments. Hide fine markings before aliasing becomes distracting.
6. **Buildings and roads:** anchor terminals and hangars to apron edges; relocate generated buildings that occupy pavement. Add sparse service-road/parking surfaces behind them. A building layout and an apron layout must be generated together.
7. **Night cues:** sparse blue taxiway edge lights and selected green centerline lights, plus restrained apron illumination baked into materials. Batch existing light sprites. Do not outline every pavement polygon with bright runway-like white lights or add hundreds of dynamic point lights.

Imported networks can be incomplete. Fill a small verified gap only when endpoints, width, direction and land constraints agree; otherwise leave it incomplete or replace that feature family with the procedural fallback. Never overlay a second synthetic network on top of a reasonably complete imported one.

### Procedural fallback

Seed by airport identity and schema version, independent of active runway end or quality setting.

- Start with all runway strips and their protected visual corridors, not one runway at a time.
- Choose a feasible terminal/apron side using available boundary, existing terminal footprints and land/water constraints. Prefer a shared terminal zone for suitable parallel-runway arrangements. Where constraints are unknown, keep the generated layout compact.
- Add one main taxiway roughly parallel to the selected runway group, a small number of exits with rounded turns, then a connected apron and building zone. For a first large-airport visual preset, a 23 m taxiway width and approximately 180–250 m runway-centerline offset are tunable art defaults, not standards compliance. Scale down for small airfields.
- Clip to known land and airport extent; reject any apron/building overlap with a runway or approach corridor. When no feasible side exists, omit that element rather than pave water or cross a neighboring runway.
- For intersecting or tightly spaced runways, begin with a conservative apron and short connection; do not invent a complex network of runway crossings.
- Add irregular infield boundaries and restrained surface variation. Avoid a perfect rectangular grass patch around every runway.
- Generated pavement can meet the runway visually, but generated taxiway identifiers and operational signage stay absent. Source confidence belongs in scenery information/debug tools, not repeated cockpit prompts.

## Elevation and stable layering

The airport's operating footprint must include **all runways, taxiways, aprons and building bases**, not just the current runway corridor. Extend the shared graded-airport surface accordingly and blend into the existing radar terrain outside that footprint.

Use the same airport ground-height reference as ground physics. If physics currently assumes a flat airport, grade the operating footprint to that elevation first; do not introduce a renderer-only slope model. For validated varying runway elevations, define a continuous airport surface before laying connecting pavement. Coarse radar samples are for surrounding terrain and distant mountains, not individual taxiway elevations.

Create one dominant surface at each location. Remove or mask grass/terrain beneath pavement; resolve runway/taxiway overlaps in preprocessing, with runway markings taking precedence. Put thin markings in a controlled material/decal layer. Polygon offset and logarithmic depth remain secondary aids, not substitutes for eliminating overlapping coplanar meshes. Buildings sample their actual supporting surface when placed.

No universal raised sea plane, no free-floating apron, and no extra grass rectangle above the graded terrain. Validate distant views as well as close taxi views because the earlier depth problems were strongest at range.

## Rendering, quality and streaming

Use a hybrid surface representation: simplified pavement/land-cover masks for distance, merged footprint meshes near the aircraft, and small repeated material textures for close detail. Avoid a single huge high-resolution airport image: it wastes texture memory and still blurs at ground level.

Perform polygon repair, buffering, unions, triangulation and LOD generation offline. Browser loading should mostly decode buffers, upload bounded batches and attach ready chunks. Future procedural fallback generation can be cached or run in a worker; never rebuild it in the animation loop.

| Content | Balanced | Economy |
| --- | --- | --- |
| Runways, taxiway connectivity, apron and shoreline shapes | Full shared layout | Same shared layout |
| Surface detail | Shared 1K–2K material textures, repairs and slab seams | Smaller textures, fewer detail layers |
| Nearby markings | Centerlines and selected apron/holding detail | Essential centerlines, shorter visibility range |
| Buildings and clutter | Footprints plus roof detail and a few repeated objects | Main building silhouettes; fewer optional instances |
| Lighting | Essential runway/approach/PAPI plus bounded taxi/apron cues | Same essential aids; reduced secondary range/density |

Initial **additional airport-ground** budgets, to measure with the cockpit active:

| Metric | Balanced | Economy |
| --- | ---: | ---: |
| Visible ground triangles | ≤20,000 | ≤8,000 |
| Ground draw calls | ≤12 | ≤6 |
| Ground texture GPU memory, including mipmaps | ≤24 MiB | ≤10 MiB |
| Compressed layout download per airport | target ≤1 MiB | same package; fewer decoded optional assets |

These are provisional caps, not measured results. Simplify over-budget airports while preserving topology and the dominant apron shapes. A 2K RGBA texture already costs about 21 MiB with mipmaps, so separate 2K maps for every material would exceed the target. Share small tiles, use single-channel masks or suitable compression, and measure actual renderer memory.

Partition large airports into roughly 1 km chunks. Prefetch departure and arrival packages during flight setup, prepare likely diversion airports opportunistically, and use fallback immediately if no package is ready. Never wait for external data on final approach or replace the airport layout under the aircraft during rollout.

Keep coarse airport geometry available while its bounds intersect the visibility range. Load finer chunks near the aircraft, use separate load/unload distances, and dispose passed chunks after a short grace period. Share materials/textures with reference counts; dispose airport-wide resources when leaving the airport scene and release optional LOD assets when the quality profile permits. Bound both GPU objects and decoded CPU packages with an LRU budget. Preserve the existing 11,000/9,000 ft AGL Economy hysteresis; quality changes must not trigger network requests or alter ground topology.

## Delivery and verification

1. **Ground foundation:** normalize airport coordinates and source confidence, define shared ground sampling and depth ownership, then render one connected procedural taxiway/apron/building layout. Include an island airport and a parallel-runway airport.
2. **Imported pilot airports:** package VHHH and KLAX from checked OSM extracts; inspect current FAA coverage for a separate US official-data sample. Produce plan-view source/generated overlays before judging cockpit screenshots. Exact OSM completeness at VHHH/KLAX is not established by this planning research.
3. **Materials and lighting:** add bounded surface variation, nearby markings and taxi/apron night cues; compare identical approaches in Balanced and Economy.
4. **Streaming and rollout:** verify chunk replacement, disposal, airport changes and offline fallback. Expand source coverage only after the first two airports meet correctness and performance gates.

Acceptance cases:

- Connected exits and aprons; no isolated terminal boxes standing in grass when a supporting apron is expected.
- Parallel/intersecting runways, reciprocal approaches and active-runway changes preserve a stable airport layout.
- VHHH pavement remains on land; terrain transitions at mountainous airports stay outside the graded operating area.
- No terrain-through-pavement, depth flashing, floating buildings or visual steps at runway/taxiway joins, near or far.
- Clear/hazy day, dusk, night, wet surfaces and low visibility preserve usable runway cues; taxiway lights remain visually distinct.
- Missing, partial, corrupt or slow source packages yield deterministic fallback without a stalled flight.
- Economy keeps the same airport layout and essential landing lights. Altitude oscillations near 10,000 ft do not cause repeated rebuilding.
- Repeated flights, airport visits and quality switches return GPU/CPU memory to a bounded baseline. Record p95 frame time, draw calls, triangles, texture memory and load-time long tasks with the replica panel visible.

Proposed future modules: a maintenance importer under `scripts/`, versioned static packages under `public/scenery/airports/`, source/quality normalization in `src/services/`, pure fallback geometry in `src/utils/`, and a ground builder consumed by `OutsideFlightScene.jsx`. These are planned boundaries; this document adds no runtime code or dependencies.
