# Deployment readiness review

Reviewed 2026-10-20 against the current working tree, including existing uncommitted work. This is a source and automated-check review; a browser playthrough, screenshots, real-device performance measurements, and authenticated Supabase verification remain required.

## Settings improvements implemented

- Shared display settings in the home menu and cockpit: Balanced/Economy outside rendering, immediate language switching, reduced interface motion, settings contrast, and expandable keyboard help.
- Device-local preferences restore on startup; blocked browser storage does not prevent changing display preferences or offline mode for the session.
- Settings panels scroll within the viewport and the cockpit settings panel fits narrow screens. Labels, focus indicators, and close-button names improve keyboard usability.
- Offline cloud-save controls are disabled and explain their availability. Cloud preferences remain account settings; display preferences remain device settings.
- Reduced motion also bypasses the home menu's animated entry delay. Scenery rendering and flight instruments continue updating.

## Prioritized completion work

| Priority | Area and evidence | Completion criteria |
| --- | --- | --- |
| P0 | Lint fails: initial run reports 1,642 errors and 31 warnings across the current source tree. Deployment previously ran no tests. | Resolve errors and meaningful hook warnings, then require lint in CI. Tests and AIP route smoke checks now run before deployment. |
| P0 | Deployment failure propagation: the previous `build:local-aip` shell command returned the cleanup command's result, potentially hiding preparation/build failures. | Implemented a build runner that always cleans staged assets and preserves failure status. Verify failed builds cannot publish. |
| P0 | Flight recovery has been rebuilt; authenticated production verification remains. Previously: `App.jsx` defines `handleResumeFlight`, resume loading/error state, and discard handling without a rendered caller. The resume handler restores plan/weather but does not pass a saved simulation snapshot to `FlightInProgress`. | A visible resume/discard flow restores aircraft position, systems, failures, route, and time; exercise account, offline, corrupt-save, and reload cases. |
| P0 | Browser configuration fallback: `SupabaseClient.js` falls back to `process.env` when Vite variables are absent. Browser runtimes do not normally provide `process`. | Test a production build without Supabase configuration and ensure offline startup never throws. Verify configured authenticated startup separately. |
| P0 | VNAV capture and route-altitude wiring have been repaired and regression-tested. Previously: a repeated full-suite run failed `VNAV drives climb to altitude constraint in LNAV` at `tests/autopilot.test.js:456`, despite the initial 353-test run passing. | Reproduce under controlled weather/randomness and fix or isolate the cause before relying on CI. Do not weaken the assertion merely to pass. |
| P1 | Rendering recovery: GPS-only terrain and a translated WebGL initialization error are implemented. Previously: `OutsideFlightScene.jsx` catches WebGL renderer initialization failure and returns without a visible explanation. No application error boundary was found. | Show a useful unsupported/lost-context state, keep flight controls usable, and provide recovery for component errors. Test hardware acceleration disabled and context loss. |
| P1 | Navigation and settings accessibility: the home settings overlay does not trap focus or implement Escape/return-focus behavior. Other overlays use varying absolute positioning and inline styles. | Use a shared accessible dialog pattern, test keyboard-only operation, and check 200% zoom and small viewports across settings, dispatch, maps, and cockpit drawers. |
| P1 | Release journey coverage: Node suites cover many physics and service behaviors, but this review did not establish browser end-to-end coverage. | Record a complete home → dispatch → startup → taxi → takeoff → approach → landing/reset playthrough, plus tutorial/challenge completion and save/load. Include English/Chinese and offline/online variants. |
| P1 | Content/data coverage: AIP smoke checks skip the US same-region case because local lookup rows are absent; some successful routes use synthetic DCT connectors. | Decide supported launch regions, communicate route/scenery limitations, and add representative cases for every advertised region. Verify airport source attribution and asset size. |
| P1 | Localization and release identity: FMC forms still contain literal English labels/placeholders; home footer says `v2.0.1 Beta`, while package version is `0.1.0`. | Audit all screens in Chinese, translate remaining copy, and use one release-version source. |
| P2 | Ownership and organization: `FlightInProgress.jsx` exceeds 2,100 lines; `App.jsx` mixes routing, dispatch, cinematics, account state, and resume logic. Several panel implementations coexist. | Extract session/persistence hooks and rendering/UI boundaries incrementally, document the active cockpit path, and remove unreachable legacy flows after parity checks. |
| P2 | Further settings completion: no working audio playback/volume infrastructure was found in services/hooks during this review. Keyboard bindings are centralized but not user-remappable. | Add sound mixing and mute only with working audio; then add remapping/reset and control sensitivity with persistence and input validation. Consider measured graphics presets and a performance indicator after profiling. |
| P2 | Multiplayer scope: the home entry is disabled as “Coming Soon,” while multiplayer session services and in-flight status handling exist. | State the release scope consistently; either finish discovery/join/reconnect/leave flows or keep the feature clearly unavailable throughout the UI. |

## Checks and remaining manual validation

- Initial `npm test`: 353 passed. A display-preference regression test was added for defaults, persistence, DOM application, and unavailable storage.
- Final full-suite rerun: 354 passed. The preceding run had one VNAV climb failure; the passing rerun does not resolve that intermittent risk.
- `npm run build:local-aip`: passed; staged assets were removed afterward. Bundle warnings remain: main JavaScript is approximately 1.54 MB minified (425 KB gzip), and airport ground layout is approximately 570 KB minified (147 KB gzip). Prioritize code splitting and loading measurements before adding more startup content.
- `npm run test:aip-route-search`: 6 passed, 0 failed, 1 skipped (US local data coverage).
- Focused ESLint checks for the new display modules, settings panel, entry point, and home page pass. Repository-wide lint remains a release blocker.
- Verify preference persistence after reload, settings changes before and during flight, reduced-motion behavior, and keyboard-only navigation in a browser. Capture settings screenshots before merging.
- Verify Supabase schema/RLS, save ownership, expired sessions, and cloud error recovery against the actual deployment configuration.
- Profile scenery and initial data loading on a low-powered laptop and a mobile browser; the 20/30 fps settings describe render targets, not measured performance guarantees.
