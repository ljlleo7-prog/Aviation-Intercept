# Ultimate Crash Simulator — Revival PRD

**Status:** Draft for team review  
**Product horizon:** Revival release through v1.0  
**Working premise:** Preserve the playable concept, replace unsustainable implementation incrementally.

## 1. Product Vision

Ultimate Crash Simulator is a browser-native, systems-focused flight simulator in which pilots manage realistic aircraft operation, abnormal events, and cascading failures. It should deliver enough procedural and systems depth to reward aviation knowledge while remaining install-free, responsive on ordinary laptops, and understandable to motivated newcomers.

The product is not trying to match a desktop simulator's global scenery or photorealism. Its advantage is concentrated cockpit depth, consequential failures, accessible scenarios, and fast entry from a web link.

## 2. Problem Statement

The current game proves the experience can be compelling, but the implementation cannot support predictable growth. Simulation, UI, narrative, routing, persistence, and aircraft-specific behavior are tightly coupled. Several core files exceed 800 lines, with the physics service near 3,000 lines and the main flight view above 2,000. The current baseline builds, but tests and lint do not pass. Localization mixes translated keys, hardcoded English, deliberate English-only bypasses, and incompatible placeholder conventions, allowing raw keys or `${placeholder}` text to reach players.

Revival must improve reliability and architecture without pausing all visible product progress or rewriting the simulator from scratch.

## 3. Target Players

- **Hardcore aviation enthusiasts:** want credible procedures, aircraft behavior, system dependencies, and failures.
- **Scenario players:** want tense, replayable emergencies with clear objectives and meaningful outcomes.
- **Learning-oriented newcomers:** want progressive assistance without simplified physics replacing the underlying model.

## 4. Product Principles

1. **One aircraft done deeply beats many aircraft done superficially.** The Boeing 737-800 is the first consolidated aircraft package, used to prove the platform contract—not as a source of engine defaults or special cases.
2. **Deterministic simulation first.** A scenario must be reproducible from aircraft, configuration, weather, and seed.
3. **The engine is aircraft-neutral.** A consistent loader discovers and validates individual aircraft packages. Shared simulation contracts remain generic; each package supplies performance, systems, panels, procedures, limitations, assets, and translations. No shared subsystem may assume 737 identifiers, topology, engine count, control layout, or operating values.
4. **Assistance changes guidance, not reality.** Difficulty controls hints, crew help, and failure pressure—not contradictory physical laws.
5. **Offline core, optional online enrichment.** Normal flight, built-in routes, weather presets, and scenarios must work without Supabase or third-party APIs.
6. **No untranslated UI ships.** Missing keys and unresolved placeholders are release-blocking defects.

## 5. Core Experience

A player selects an aircraft, route, weather, assistance level, and scenario; prepares the aircraft; taxis, departs, navigates, manages systems and crew; responds to normal or abnormal events; then lands or reaches a defensible outcome. The simulator records objective results such as procedural errors, aircraft exceedances, failure response, fuel state, and landing quality.

## 6. Functional Requirements

### Flight and environment

- Stable fixed-timestep six-degree-of-freedom simulation with documented units and coordinate frames.
- Credible ground handling, aerodynamic envelopes, propulsion, fuel/weight effects, wind, turbulence, icing hooks, and terrain/runway contact.
- Repeatable automated flight profiles for taxi, takeoff, climb, cruise, descent, approach, landing, and rejected takeoff.

### Reference aircraft

- A coherent 737-800 implementation covering electrical, fuel, hydraulic, pneumatic, propulsion, flight controls, warnings, autoflight, navigation, radios, and normal/abnormal checklists.
- Cockpit controls must read from and command the same authoritative system state used by physics and failures.
- The 737-800 must load exclusively through the public aircraft-package interface used by every future aircraft; it may not use privileged engine paths.
- The loader must validate package metadata and schema versions, declare capabilities, lazy-load code/assets, produce actionable errors, and prevent partially valid packages from starting a flight.
- A minimal synthetic test aircraft must exercise different engine counts, system topology, and performance values to detect hidden 737 assumptions without expanding the playable fleet.
- Other aircraft remain explicitly experimental until they meet the same package contract and validation suite.

### Operations and scenarios

- Route and runway selection, basic performance planning, loading, weather selection, save/resume, and an offline fallback path.
- Authored and seeded scenarios with prerequisites, triggers, cascades, success/failure criteria, and debrief metrics.
- NPC crew and ATC may assist, but cannot silently mutate aircraft state outside auditable commands.

### Internationalization and accessibility

- English and Simplified Chinese parity for all player-facing interface, errors, tutorials, scenarios, checklists, and generated templates.
- One placeholder syntax and a formatter that reports missing keys, missing parameters, and locale shape mismatches during tests/builds.
- Locale-aware number/unit presentation where appropriate; aviation identifiers and standard abbreviations remain unchanged.
- Keyboard-operable essential controls, readable contrast, scalable text, and reduced-motion support.

### Operational user guide

- Ship a complete, versioned English and Simplified Chinese guide aligned with the implemented 737-800 and the current UI.
- Cover simulator setup and controls; cockpit orientation; cold-and-dark power-up; flight planning and performance; clearance delivery and ATC phraseology; pushback and engine start; taxi; takeoff; climb; en-route navigation and system monitoring; descent planning; approach setup; landing; taxi-in and shutdown; save/resume; failures, warnings, abnormal checklists, diversion, and debriefing.
- Distinguish required actions, recommended technique, simulator-specific limitations, and real-world reference information. Do not imply certification or real-flight training suitability.
- Link procedures to cockpit controls and checklist identifiers, define prerequisites and expected indications, and include troubleshooting for blocked progression.
- Provide a searchable in-app presentation plus a repository-maintained source suitable for review, localization, and offline use. Contextual help may deep-link to the relevant procedure.
- Documentation changes are part of the definition of done whenever controls, procedures, ATC flow, or supported aircraft behavior changes.

## 7. Technical and Performance Requirements

- Simulation state must be independent of React rendering and expose versioned commands, events, and snapshots.
- Fixed-step simulation remains stable when rendering slows; UI updates are rate-limited independently.
- Target 60 FPS on a current mid-range laptop and 30 FPS on supported low-power hardware during the reference scenario.
- Initial JavaScript target: under 500 KB gzip, excluding lazily loaded aircraft/scenario packs; no single eager feature chunk above 250 KB gzip.
- A flight must start offline after initial asset load. Network failures must degrade clearly and safely.
- CI blocks merges on formatting/lint, type or schema validation, unit/integration tests, locale validation, production build, and a browser smoke flight.
- Saved flights include a schema version and migrations; corrupt/incompatible saves fail safely.

## 8. Scope Boundaries for v1.0

Included: an aircraft-neutral engine and validated package loader, one deeply modeled aircraft package, worldwide route-capable data with documented limitations, core weather and failures, scenarios, debriefing, a complete operational user guide, English/Chinese support, local saves, optional account/cloud features, and desktop-class browsers.

Excluded unless separately approved: photorealistic global scenery, certified training claims, mobile-phone cockpit parity, unrestricted live multiplayer, airliner-wide study-level fleets, and mandatory generative AI. AI-generated narrative is optional enrichment and must have deterministic fallbacks.

## 9. Success Metrics and Release Gates

- At least 95% of instrumented sessions reach cockpit readiness without an application error.
- At least 80% of first-time players complete the guided takeoff scenario.
- Median returning-player session is at least 20 minutes.
- Reference scenarios replay identically from a recorded seed and command stream.
- Zero unresolved localization keys/placeholders in release builds and 100% English/Chinese key parity.
- The 737-800 and synthetic test aircraft pass the same loader and engine contract suite with no aircraft-specific branches in shared engine code.
- Every supported normal flight phase and released abnormal scenario maps to a reviewed guide procedure in both languages; automated link/key checks find no orphaned help targets.
- Zero known critical simulation-state divergences, save corruption defects, or blocker-severity accessibility failures.
- Performance targets hold through a representative 60-minute automated flight.

## 10. Open Product Decisions

Before production planning is locked, the team must decide the primary v1.0 reference aircraft and variant, minimum supported browsers/devices, intended realism baseline (document sources and tolerances), commercial model, account requirements, and whether the name “Ultimate Crash” supports the long-term positioning.

