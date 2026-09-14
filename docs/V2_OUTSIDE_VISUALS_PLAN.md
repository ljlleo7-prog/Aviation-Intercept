# Ultimate Crash 2.0 — Outside Visuals Plan

Status: planning document only  
Scope: forward views from the cockpit, with emphasis on approach, landing, takeoff, and runway operations  
Decision: use Three.js directly behind the replica cockpit, without attempting a general-purpose scenery engine

## 1. Product decision

Version 2.0 should add a small, procedural **airport visual bubble** rather than a continuous 3D world.

The view must give a pilot enough visual information to:

- find and identify the intended runway;
- judge lateral alignment, glide path, height, sink, flare, and runway closure rate;
- perceive bank, pitch, drift, crosswind, touchdown, and rollout;
- understand visibility, cloud, precipitation, daylight, and runway lighting;
- retain the visual quality of the new replica cockpit.

Only the active runway and facts supported by available data are authoritative. The area around it may be synthesized. Generated taxiways, terminals, roads, and buildings are background dressing and must never be used for taxi instructions or scored navigation.

This is a better fit than full scenery because the simulation already knows aircraft pose, runway geometry, terrain height, weather, and approach state, but does not consistently know the airport's complete surface layout. It also keeps asset size, draw calls, memory use, and GPU fill under control.

## 2. Visual target

The intended look is **restrained photographic realism**, not a low-poly diorama and not a satellite reconstruction.

Realism should come mainly from:

- correct scale, perspective, motion, runway placement, and light spacing;
- high-quality compressed surface textures with normal and roughness variation;
- runway markings and rubber wear applied as decals;
- atmospheric perspective, haze, fog, cloud layers, and believable exposure;
- irregular but deterministic distribution of grass, service areas, buildings, and lights;
- a small set of well-made silhouettes and texture variants, reused through instancing;
- the cockpit frame occluding and grounding the view.

The design should avoid featureless colored planes, visibly perfect boxes, saturated game-like colors, repeated objects with identical rotation, and dense geometry added only to disguise weak materials.

The first release needs one fixed captain-eye forward camera. Free cameras, walkaround views, cabin views, photogrammetry, road traffic, animated ground crews, and a complete taxi environment are outside the initial scope.

## 3. What is accurate, inferred, and decorative

Every generated airport receives a data-confidence tier. This prevents visual decoration from silently becoming navigation data.

| Tier | Available data | Visual behavior |
| --- | --- | --- |
| A | Both thresholds, headings, length, width, elevations, surface, lighting | Place and size runway from source coordinates; render declared surface and lights. |
| B | Airport position plus runway identifier, heading, length, and width | Center the runway near the airport reference point using the current geometry fallback; mark the scene internally as approximate. |
| C | Airport position plus partial runway facts | Use conservative defaults for missing width, surface, and lighting; keep only the runway authoritative. |
| D | Airport position or runway name only | Provide horizon, terrain/ground plane, an approach-direction indication, and optional synthetic runway only in practice or accessibility mode. Do not present it as surveyed scenery. |

The runtime should expose the tier to a small development overlay. Normal players do not need a permanent warning, but setup can label low-data destinations as “limited outside visuals.”

The local AIP export contains a large runway table with useful threshold fields, but many rows have missing end coordinates and headings. The current `airportService.getRunwayGeometry()` can synthesize runway ends around the airport reference point and already returns heading, length, width, thresholds, elevation, runway name, and ILS frequency. Version 2.0 should preserve the distinction between sourced thresholds and this fallback instead of flattening both into the same confidence level.

## 4. Scene composition

### 4.1 Cockpit integration

The Three.js canvas sits behind the upper windshield region of the aircraft-specific replica. The panel, glare shield, pillars, and window frames remain DOM/SVG/HTML so they stay crisp and interactive. The outside canvas should not cover screens or controls.

Each aircraft defines a small camera profile:

- eye height and longitudinal/lateral offset;
- vertical and horizontal field of view target;
- neutral camera pitch;
- windshield crop or mask;
- optional vibration response limits.

Camera profiles are presentation calibration, not new flight physics. Aircraft pose always comes from the physics output. The visual layer interpolates between simulation samples and never feeds position or attitude back into the simulation.

At narrow layouts, use a cropped captain-side view with the essential flight instruments still visible. On devices that cannot sustain the minimum quality level, replace Three.js with an explicit instrument-only mode rather than running an unstable renderer.

### 4.2 Coordinate system

Use a local east-north-up frame centered near the active runway to avoid floating-point jitter. Convert latitude/longitude to local metres once when the visual bubble is built. Rebase the scene only outside the airport bubble or after a route/airport change; do not move thousands of objects every frame.

The render camera consumes:

- latitude and longitude;
- altitude AMSL and AGL;
- roll, pitch, and true heading;
- ground speed and vertical speed for subtle effects;
- runway geometry and airport elevation;
- weather visibility, cloud cover, precipitation, wind, and time.

The existing physics output already provides most of these values. Time of day and source/confidence metadata require a defined visual-state contract.

### 4.3 Distance bands

Use three deliberately different bands:

| Band | Range | Content |
| --- | ---: | --- |
| Far | horizon to roughly 20–30 km | sky, haze, low-resolution terrain silhouette or analytical ground/horizon; no buildings |
| Airport | roughly 0–8 km from runway | active runway, lights, broad ground materials, a few instanced airport silhouettes and service-area patches |
| Detail | roughly 0–2 km from camera | runway decals, edge detail, rubber, grass variation, touchdown-zone cues, precipitation interaction |

Objects should fade or merge into haze before their low detail becomes obvious. A hard circular edge around the airport bubble is unacceptable.

## 5. Procedural airport bubble

Build the bubble deterministically from `airport code + runway end + visual schema version`. Reloading the same approach must produce the same skyline and surface variation, which supports testing and avoids distracting changes.

### Authoritative runway

Construct one runway mesh from threshold positions, width, and elevation. Give it a slightly subdivided surface only if elevation or crown is modeled; otherwise keep it a simple strip. Apply:

- asphalt or concrete material variants;
- runway designation, centerline, threshold, aiming point, touchdown-zone, side-stripe, and displaced-threshold decals as applicable;
- rubber and repaired-surface masks from seeded texture layers;
- runway edge, threshold/end, centerline, and approach lights only when known or allowed by a clearly named fallback rule;
- small emissive meshes or instanced sprites whose apparent size is clamped for long-range visibility.

Markings must use runway dimensions rather than stretching a single runway image. This preserves correct spacing and closure cues.

### Plausible surroundings

Surround the runway with a few large material zones rather than a polygon-perfect airport:

- grass or arid infield chosen from broad regional/climate information;
- one or two apron/service pads offset from the runway protected area;
- sparse hangar, terminal, tower, tank, and utility silhouettes outside obstacle-clear zones;
- drainage, dirt, mowing, or concrete variation baked into ground decals;
- distant urban/tree light cards when conditions and region justify them.

Do not generate a connected taxiway network in the landing release. A plausible taxiway that does not match reality can cause worse operational decisions than having none. The runway rollout can end with a neutral “taxi view unavailable” transition until verified layout data is introduced.

### Terrain

Terrain is primarily a horizon and height-reference problem. The visual height field must be derived from `TerrainRadarService`, which currently stores one elevation sample per 0.01° grid cell (roughly 1.1 km north/south, with longitude spacing varying by latitude). The renderer must not maintain a second elevation source. A hill shown through the windshield must agree with the terrain values used by warnings and ground logic.

Build the terrain in two stages. First, snapshot the available radar cells around the active runway into an immutable coarse grid. Second, create the render mesh with bounded interpolation between those samples. Recommended behavior:

1. Convert every radar cell center from latitude/longitude to the airport-local east-north-up frame.
2. Express height relative to airport elevation so the mesh, runway, and aircraft share one vertical datum.
3. Fill short internal gaps only when enough neighboring cells exist. Keep large missing regions unknown rather than treating `null` as sea level.
4. Apply a small median pass to isolated one-cell spikes, followed by monotone bicubic or smooth bilinear interpolation. Clamp every interpolated point to the minimum and maximum of its contributing source cells so smoothing cannot invent a new peak or valley.
5. Preserve the original sample values at their grid locations. Smoothing changes the surface between measurements, not the measurements themselves.
6. Grade the mesh to the same airport-elevation reference used by ground physics across the airport operating area, then blend smoothly back to radar elevations based on distance from the runway footprint. Keep the fully graded area large enough that coarse triangles outside it cannot cross the pavement, while ending the transition before nearby operationally significant hills.
7. Generate normals after interpolation and use material shading and haze to hide the remaining coarse resolution.

Do not place a universal ground plane at airport elevation. Keep sea level, airport elevation, runway-end elevations, and radar terrain in the same AMSL-derived local frame. Water may use a cheap flat plane at 0 ft AMSL, while land comes from the radar mesh. A reclaimed or graded airport may have a small explicit airport-platform mesh derived from the runway footprint and surveyed runway elevation; it must not extend beneath the surrounding water or unrelated terrain. Runways sit on that platform or directly on the sampled/graded terrain as appropriate. Buildings and other ground objects must query their supporting surface height when their instances are built, so their bases follow terrain or the airport platform instead of assuming local height zero.

Give overlapping surface classes an explicit depth hierarchy. Clip radar terrain at or just above the water datum so seabed triangles do not compete with the water plane. Suppress terrain beneath an explicit airport platform, keep the platform top below the runway, and offset runway decals above the pavement by a tested depth-safe amount. Do not depend on render order alone to resolve coplanar surfaces at long viewing distances.

The graded radar mesh should normally provide the visible grass/infield surface around a runway. Do not add a second rectangular grass plane over it. A reclaimed-land fill may provide shoreline sides beneath the terrain, but its top stays hidden below the unified graded mesh. This avoids material seams and depth conflicts between “airport grass” and “terrain grass.”

The terrain mesh should begin with one rendered vertex per radar cell; for a 19×17 snapshot, that is only 576 triangles. Smooth vertex normals and bounded interpolation in the material or rasterization provide continuity without subdividing the geometry. Add vertices only around a surveyed runway-elevation blend when tests show they are necessary. Rebuild terrain in chunks only when new radar cells arrive. Do not reshape a chunk during the last seconds of approach: stage updates off-screen, then swap the completed geometry between frames. Cache the completed airport grid for the session, and use lower mesh density in the far band because additional triangles cannot recover detail absent from the radar source.

When data is pending, continue the last valid terrain surface and fade it into atmospheric haze before the unknown boundary. When no surrounding samples are available, show a flat airport-elevation plane with a distant horizon; do not generate decorative ridges that could contradict terrain radar. Development mode should be able to display source sample points, missing cells, the smoothed mesh, and height error at the cursor.

Never derive collision or ground-contact decisions from the render mesh. The existing terrain and physics services remain authoritative.

## 6. Atmosphere and weather

Atmosphere will deliver more perceived quality per millisecond than dense scenery.

Use a procedural sky shader or a small set of generated sky textures, one sun/moon directional light, hemispheric fill, exponential fog, and filmic tone mapping. Clouds should begin as one or two camera-facing or shallow dome layers, not volumetric ray marching. Precipitation should be a camera-local instanced field with a strict particle cap. Wet runways should change roughness and introduce a restrained reflection response; screen-space reflections are unnecessary for the first release.

Visibility must control the actual fog distance and contrast, not merely add an overlay. Runway and approach lights should emerge through haze without remaining perfectly visible at all distances. Night scenes depend on darkness, lighting rhythm, and a few distant emissive cards rather than thousands of illuminated buildings.

Weather effects must degrade gracefully in this order: precipitation density, decorative lights, cloud detail, ground normal maps, distant objects. Runway geometry, markings, horizon, attitude response, and essential runway lights remain last to degrade.

## 7. Renderer and performance architecture

Use Three.js directly rather than React Three Fiber for the first implementation. The existing application already has a large React update surface, and a small imperative renderer makes it easier to isolate a fixed-budget animation loop from cockpit rerenders. This decision can be revisited if the visual system grows substantially.

Create a single renderer and canvas for the entire outside view. Build static scene content only when the airport, runway, data tier, weather regime, or quality profile changes. Every animation frame should update the camera, a few uniforms, light intensity, and limited weather particles.

Required controls:

- cap device pixel ratio independently of browser DPR;
- use instancing for all repeated lights, trees, and structures;
- use texture atlases and compressed KTX2/Basis textures where supported;
- share materials and geometry;
- disable shadows by default; evaluate one low-resolution directional shadow only for the highest profile;
- avoid real-time reflections, volumetric clouds, post-processing chains, physics bodies, and per-frame geometry creation;
- pause rendering when the page is hidden and reduce to a low update rate when the visual area is obscured by a full-screen panel;
- interpolate pose in the renderer without pushing React state at animation frequency;
- dispose GPU resources on airport/runway changes and on unmount.

Proposed starting budgets, to be validated on representative devices:

| Metric | Balanced desktop | Economy / integrated GPU |
| --- | ---: | ---: |
| Target frame rate | stable 45–60 fps | stable 30 fps |
| Canvas render scale | DPR capped at 1.25 | DPR 0.75–1.0 |
| Draw calls on final | at most 80 | at most 45 |
| Visible triangles | at most 150k | at most 60k |
| Visual-system GPU memory | at most 160 MB | at most 80 MB |
| Main-thread visual work | p95 under 5 ms/frame | p95 under 8 ms/frame |
| Initial visual download | at most 8 MB compressed | at most 4 MB compressed |

These are engineering gates, not promises. Measure them with the complete replica panel running, because DOM/SVG rendering and Three.js compete for the same frame budget.

## 8. Quality profiles and automatic adaptation

Offer three profiles and an instrument-only fallback:

- **Economy:** 30 fps target, reduced render scale, simple sky, fog, runway, essential lights, few silhouettes, no shadows.
- **Balanced:** 45–60 fps target, full surface materials, cloud layer, precipitation, normal maps, more silhouettes.
- **High:** higher render scale, optional restrained shadowing, denser decorative details; still uses the same airport bubble.
- **Instrument only:** no WebGL canvas; current cockpit behavior remains usable.

An automatic governor may lower render scale after sustained missed frame time and raise it only after a long stable interval. It should never switch major visual features repeatedly during final approach. Lock the chosen feature set below 1,500 ft AGL and vary render scale gradually if needed.

Store the user's chosen profile and provide a frame-rate/render-scale readout in development settings. Do not make the normal pilot UI display engine metrics.

## 9. Visual-state contract

Introduce a read-only adapter between simulation data and rendering. A proposed conceptual shape is:

```text
VisualFlightState
  pose: lat, lon, altitudeMslM, altitudeAglM, rollRad, pitchRad, headingRad
  motion: groundSpeedMps, verticalSpeedMps
  airport: code, elevationM, activeRunway, runwayGeometry, geometrySource, confidenceTier
  environment: visibilityM, cloudCover01, precipitation01, wind, localSolarTime
  aircraft: visualProfileId, eyePointId
  lifecycle: flightPhase, paused, crashed
```

Normalize units and null behavior in this adapter. Do not let render components inspect several alternative fields such as `flightData.altitude`, `derived.altitude_ft`, and `position.z`. The current application has valid legacy fallbacks, but the new visual boundary should have one meaning for every value.

The adapter should sample simulation state through a mutable snapshot/ref or external-store pattern. React can handle lifecycle changes, while the Three.js loop reads the most recent snapshot and interpolates pose.

## 10. Delivery phases

### Phase 0 — calibration spike

Goal: prove that outside motion, camera calibration, and the replica panel agree.

- Put a Three.js canvas behind one aircraft's windshield prototype.
- Render sky, horizon, flat ground, and one accurately scaled runway.
- Drive camera pose from recorded deterministic approach telemetry.
- Calibrate captain eye point and FOV using runway width and aiming-point sight picture.
- Profile the complete cockpit at 1080p on integrated and discrete GPUs.

Exit: pilots can judge alignment and flare better than with instruments alone; no sustained cockpit frame regression; camera calibration is documented.

### Phase 1 — landing minimum product

Goal: make day/VMC landing usable at supported airports.

- Add the visual-state adapter and runway confidence tiers.
- Add procedural markings, surface variation, grass/infield, haze, and basic silhouettes.
- Support approach through rollout on the active runway.
- Add Economy, Balanced, and instrument-only profiles.
- Add deterministic visual replay tests and performance instrumentation.
- Feed a bounded, sample-preserving terrain mesh from a frozen `TerrainRadarService` grid snapshot.

Exit: representative Tier A–C airports produce stable, correctly aligned runways; low-data handling is honest; the balanced profile meets its measured frame budget.

### Phase 2 — weather, dusk, and night

Goal: extend useful landing cues across operational conditions.

- Add solar time, exposure regimes, runway/approach light families, simple clouds, precipitation, and wet materials.
- Connect visibility to fog and contrast.
- Validate light visibility and spacing at standard approach distances.

Exit: VMC, reduced visibility, dusk, night, and rain test approaches remain readable without excessive GPU cost.

### Phase 3 — broader airport character

Goal: reduce repetition without claiming surveyed scenery.

- Add climate/region material families and deterministic skyline kits.
- Add low-resolution terrain where data is available.
- Add airport-specific overrides only for frequently used destinations where source data and ownership are clear.

Exit: airports have recognizable regional character and the asset/download budgets still pass.

### Deferred surface movement

Taxi guidance should be a separate project gated on authoritative taxiway, apron, holding-point, sign, and stand data. It should not be smuggled into the landing bubble as decoration.

## 11. Validation plan

Use a deterministic approach replay matrix rather than relying only on live hand flying. Capture the same state stream at several airports and compare both correctness and performance.

Minimum scenarios:

- long and short runways, narrow and wide runways;
- reciprocal runway ends and displaced thresholds;
- airport near sea level and at high elevation;
- flat terrain and mountainous horizon;
- Tier A, B, C, and D data;
- day, dusk, night, clear, haze, rain, and low visibility;
- aligned final, localizer offset, crosswind crab, bank correction, flare, hard landing, and runway excursion;
- 1366×768 integrated GPU, 1920×1080 typical laptop, and a representative high-density mobile/tablet viewport.

Correctness assertions should cover threshold position, heading, dimensions, marking layout, reciprocal-end selection, camera attitude, AGL/AMSL use, fog distance, terrain sample preservation, interpolation bounds, missing-cell behavior, runway-elevation blending, and teardown/resource disposal. Screenshot baselines should use fixed state, seed, resolution, and quality profile. Performance captures should report median and p95 frame time, draw calls, triangles, renderer memory, and long tasks while the full panel is active.

Pilot evaluation should answer concrete questions: Can the runway be acquired at expected visibility? Is lateral drift visible? Does runway width feel correct? Is the flare sight picture believable? Is touchdown location apparent? Do the visuals ever imply a false taxi route or obstacle?

## 12. Proposed repository boundaries

When implementation begins, keep the visual system separated from simulation services:

```text
src/
  components/outside-view/
    OutsideView.jsx
    OutsideView.css
  services/visuals/
    OutsideRenderer.js
    VisualStateAdapter.js
    AirportBubbleBuilder.js
    RunwayBuilder.js
    AtmosphereController.js
    QualityGovernor.js
    geo.js
  config/visuals/
    aircraftCameraProfiles.js
    qualityProfiles.js
    runwayDefaults.js
  data/visuals/
    airportOverrides.json
  assets/visuals/              # or public assets if required by the build strategy
tests/
  visual_state_adapter.test.js
  runway_visual_geometry.test.js
  airport_bubble_determinism.test.js
```

`OutsideRenderer` owns Three.js objects and the animation loop. `OutsideView` owns mounting, resize observation, accessibility/fallback state, and lifecycle props. `VisualStateAdapter` is the only module that understands legacy flight-state shapes. Builders receive normalized data and a seeded random source; they do not import the physics service.

Three.js is not currently listed in `package.json`. Add it only when Phase 0 begins, and record the resulting bundle delta. Load the renderer and visual assets lazily when the flight view needs them so setup and non-flight screens do not pay the cost.

## 13. Decisions required before implementation

The following choices should be settled during Phase 0:

1. Which aircraft replica is the reference cockpit for camera calibration. The 737 is the practical first candidate because it has the most bespoke cockpit work.
2. Whether 2.0 initially supports desktop only or includes touch devices in its visual performance gate.
3. The lowest supported browser/GPU class and whether WebGL 1 is required. Prefer a WebGL 2 baseline with instrument-only fallback if product reach permits it.
4. Whether local solar time comes from scenario time, live time at the airport, or a user-selected condition. Scenario time is the most deterministic choice.
5. Whether Tier D synthetic runways are allowed in normal flights. The recommended default is to reserve them for practice/accessibility mode.
6. Which runway-light facts are trustworthy enough to render as data and which must use named, conservative fallbacks.

## 14. Explicit non-goals for 2.0 landing visuals

- worldwide continuous terrain or satellite imagery;
- exact terminal, gate, taxiway, sign, road, or city reconstruction;
- a player-controlled external/free camera;
- vehicle, passenger, bird, or ground-crew simulation;
- render-mesh collision physics;
- volumetric ray-marched clouds, real-time global illumination, or full-screen reflection pipelines;
- downloading scenery during final approach;
- allowing decorative generated content to drive ATC, taxi, collision, or scoring logic.

The result should feel like looking through a convincing cockpit window at the part of the world that matters for landing. Accuracy is concentrated on the runway, aircraft motion, visibility, and sight picture; atmosphere and disciplined art direction carry the rest.
