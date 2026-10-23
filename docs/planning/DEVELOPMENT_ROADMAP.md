# Ultimate Crash Simulator — Development Roadmap

**Planning model:** milestone gates, not fixed promises. Calendar estimates assume two active engineers plus part-time aviation/content review. Do not begin the next product milestone until the current exit gate passes.

## Current Baseline (September 2026)

- Vite production build succeeds; the eager application bundle is roughly 1.43 MB minified / 378 KB gzip.
- `npm test` fails under the installed Node 22, mainly at JSON module imports, with at least one independent route assertion failure visible.
- `npm run lint` reports 1,650 findings (1,619 errors and 31 warnings), including undefined names, duplicate class members, unreachable code, and React hook issues.
- High-risk concentration remains in `RealisticFlightPhysicsService.js` (~2,900 lines), `FlightInProgress.jsx` (~2,100), `OverheadPanel.jsx` (~1,600), `RealisticAutopilotService.js` (~1,200), and `sceneManager.js` (~1,100).
- Localization key shapes currently match between English and Chinese, but many player-facing strings bypass translation. Missing values fall back to raw keys, selected namespaces force English, and unresolved `${name}` placeholders are preserved onscreen.

## Phase 0 — Recover a Trustworthy Baseline (2–4 weeks)

**Outcomes:** every contributor can reproduce defects and merge safely.

- Pin Node/npm versions and document a clean setup.
- Make test, lint, production build, and a headless browser boot check pass in CI.
- Classify lint findings: fix correctness errors first; quarantine legacy style debt with explicit boundaries rather than globally disabling rules.
- Add crash/error capture, structured logging, a developer diagnostics overlay, and deterministic scenario seeds.
- Record golden smoke profiles for cold-and-dark startup, takeoff, cruise, approach, landing, engine failure, and save/resume.
- Freeze new aircraft, multiplayer expansion, and cosmetic panel rewrites during this phase.

**Exit gate:** clean checkout passes CI; a seeded 20-minute smoke flight runs without uncaught errors or non-finite simulation values.

## Phase 1 — Fix Language and Define Contracts (3–5 weeks)

**Outcomes:** UI defects become detectable, and module boundaries stop drifting.

- Replace the custom translation behavior with one documented API and placeholder syntax.
- Remove English-only namespace bypasses; migrate hardcoded player-facing strings.
- Add automated key parity, parameter parity, unresolved-token, and rendered-screen localization tests.
- Define canonical schemas for simulation state, commands, events, aircraft packages, scenarios, routes, and versioned saves. Introduce runtime schema validation at data/network boundaries.
- Specify one aircraft loader contract for package discovery, metadata/capability validation, lazy code and asset loading, version compatibility, and actionable failure reporting.
- Publish architecture decision records for timestep, units, frames, ownership of system state, and offline/network behavior.

**Exit gate:** English and Chinese complete the same browser smoke journeys with no raw keys or placeholders; contracts are versioned and enforced at boundaries; both the 737-800 package and a deliberately non-737 synthetic fixture load through the same interface.

## Phase 2 — Build the Simulation Kernel (6–10 weeks)

**Outcomes:** deterministic flight logic is isolated from React and testable without a browser.

- Create a fixed-timestep kernel owning clock, state, commands, event output, seeding, pause, and time acceleration.
- Move aerodynamics, ground interaction, propulsion, environment, navigation, and failures behind narrow interfaces using a strangler approach.
- Remove 737-specific names, values, engine-count assumptions, system topology, and control mappings from shared kernel code. Obtain them only through validated aircraft capabilities and data.
- Remove duplicate implementations only after characterization tests prove equivalence.
- Add snapshot/replay tooling and invariant tests for energy, mass/fuel, finite values, bounds, and timestep sensitivity.
- Run heavy simulation work in a Web Worker if profiling shows main-thread contention.

**Exit gate:** complete reference flights replay deterministically; React consumes snapshots and issues commands but does not own authoritative flight state; kernel performance exceeds real time in headless tests.

## Phase 3 — Complete One Reference Aircraft (8–12 weeks)

**Default first package:** Boeing 737-800, pending final variant confirmation. It validates the aircraft-neutral platform and receives no privileged engine behavior.

- Implement the common aircraft loader, then convert the 737-800 to a self-contained package: metadata, mass/performance tables, aerodynamic parameters, systems graph, cockpit mappings, checklists, limits, assets, and localization.
- Establish one source of truth for electrical, hydraulic, pneumatic, fuel, engine, warning, and autoflight state.
- Validate normal procedures and selected abnormal procedures against cited public references and declared tolerances.
- Add automated profiles for V-speeds, takeoff/climb performance, steady cruise, approach capture, landing, rejected takeoff, engine-out handling, and system cascades. Run generic contract tests against both the 737-800 and synthetic test aircraft.
- Mark unsupported controls or systems honestly; remove false fidelity.

**Exit gate:** the 737-800 passes its validation matrix and can complete cold-and-dark-to-shutdown plus the approved abnormal scenarios without debug intervention; shared engine code contains no 737-specific branches, and invalid/incompatible packages fail safely.

## Phase 4 — Rebuild the Player Experience (6–9 weeks)

- Split the monolithic flight view into cockpit shell, instruments, panels, overlays, and application flows connected through selectors/commands.
- Standardize cockpit controls, focus behavior, scaling, units, annunciations, loading/error states, and responsive desktop layouts.
- Rebuild setup around aircraft, route, loading, weather, assistance, and scenario validity.
- Add guided onboarding, contextual help, pause/settings, reliable local save/resume, and a measurable debrief.
- Build the searchable, offline-capable user-guide experience with stable deep links from panels, checklists, errors, ATC prompts, and tutorials.
- Profile and lazy-load aircraft panels, scenarios, debug tools, and online integrations.

**Exit gate:** newcomers can complete guided startup and flight; experts can disable guidance; accessibility and bundle/performance budgets pass.

## Phase 5 — Content, Reliability, and v1.0 (6–10 weeks)

- Ship a small, reviewed scenario set covering normal operations and distinct failure families.
- Complete and technically review the English operational guide from setup, ATC, and cold-and-dark through en-route flight, landing, taxi-in, shutdown, and abnormal operations; localize it fully into Simplified Chinese.
- Validate every documented procedure against the released UI and deterministic scenario/checklist fixtures. Add automated checks for broken links, missing translation keys, unresolved placeholders, and orphaned control/checklist references.
- Harden offline routing/data, optional cloud saves, weather, and service degradation. Keep external APIs behind adapters with timeouts and deterministic fallbacks.
- Run long-duration soak tests, cross-browser tests, save migration tests, localization QA, security review, and performance profiling.
- Conduct closed alpha, telemetry-led beta, documentation pass, and release-candidate stabilization.

**Exit gate:** all PRD success gates pass for two consecutive release candidates with no open critical defects; both guide languages cover every supported phase and released scenario.

## Post-v1.0 Candidates

Add aircraft only through the validated package contract. Consider richer terrain, shared cockpit/multiplayer, expanded ATC/traffic, weather layers, modding, and optional narrative AI after profiling and product validation. Each must earn its bundle, runtime, maintenance, and localization cost.

## Workstream Rules

- Reserve roughly 60% capacity for milestone architecture/reliability, 25% for player-visible vertical slices, and 15% for defects and tooling.
- Every refactor must preserve behavior through characterization tests or intentionally change it through an approved requirement.
- Every feature PR includes tests, English/Chinese copy, performance impact, and offline behavior.
- Track work by vertical capability and acceptance gate—not by file cleanup or line-count reduction.
- Review roadmap scope at each gate using telemetry, playtests, defect trends, and aviation validation evidence.

## Initial Backlog Items

1. Pin the supported Node version and repair JSON loading in tests.
2. Establish CI checks and a compact quality-baseline report.
3. Fix correctness-class lint errors: undefined names, duplicate members, and unreachable code.
4. Add a Playwright boot/start-flight smoke test.
5. Add seeded simulation runs and non-finite-state guards.
6. Replace raw-key fallback with visible development errors and safe production fallback.
7. Standardize interpolation and add unresolved-placeholder tests.
8. Inventory all player-facing hardcoded strings by screen and priority.
9. Write simulation state/command/event contracts and unit/frame ADRs.
10. Draft the aircraft-package/loader contract and test it with a non-737 synthetic fixture before consolidating the 737-800.
11. Inventory implemented operational flows and create the user-guide information architecture and coverage matrix.
