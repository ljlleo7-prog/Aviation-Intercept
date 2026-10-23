# Pre-release cleanup checklist

Repository inspection: 2026-10-22. This is a proposed work list, not a record of completed cleanup. The working tree contains substantial ongoing changes; preserve them and make cleanup in small, separate commits. Build/test results in PREDEPLOY_REVIEW.md are historical and must be rerun.

Cleanup applied 2026-10-23: see [release preparation](RELEASE_PREPARATION.md) for the resulting layout and current decisions. The items below retain the original audit; file locations and deployment behavior have changed. Root metadata is untracked, documentation is no longer ignored, reports and reference files have moved, the two confirmed orphan modules are removed, and deployment is manual-only for `aviation.geeksproductionstudio.com`. AIP ZIP downloads now use an optional external URL; bundled CSV fallback remains. No publication is authorized.

## 1. Ignore generated files; retain reproducible inputs

- [ ] Add `.DS_Store` to `.gitignore` and remove the tracked copies from the index: root, `AIP_DATA/`, `src/`, `src/data/`, and `src/hooks/`. Ignoring alone does not untrack existing files.
- [ ] Add `/public/AIP_DATA/` for temporary deployment staging. Keep `AIP_DATA/` itself tracked as source data.
- [ ] Consolidate the conflicting `docs/` rules. Remove the broad documentation exclusions so release guidance, architecture, and reference material can be versioned. The trailing `docs/` currently defeats the earlier exception. This checklist is also ignored until those rules change.
- [ ] Retain existing exclusions for `node_modules/`, `dist/`, `test-results/`, `.worktrees/`, `scenery-source/`, local agent caches, and `.env` files. Keep `.env.example` permitted; add a sanitized example if needed.
- [ ] Put regenerated diagnostic output under `test-results/`; avoid broad `*.json`, `*.csv`, or `*.zip` ignores, which would hide source datasets, fixtures, and release inputs.
- [ ] Decide pack artifact storage before adding ignore rules: release hosting or artifact storage for ZIPs, Git for builders, catalogs, manifests, licenses, and source overrides. A fresh checkout must still have every input required to build.
- [ ] Treat `previews/` consistently: it is ignored but many files remain tracked. Keep maintained prototypes in a documented developer area, or archive/untrack them after checking consumers. Ignoring the directory does not remove tracked previews.

## 2. Clear the root without losing useful documentation

Keep README, LICENSE, AGENTS, package/lock files, index.html, and tool configuration at root. Keep CLAUDE.md there if an active workflow discovers it by location.

| Current files | Proposed destination/action |
| --- | --- |
| `PROJECT_OVERVIEW.md`, `CODE_REFERENCE.md`, `PROJECT_INFO.md` | `docs/reference/`; reconcile overlapping architecture descriptions |
| `APPROACH_INTEGRATION.md`, `PHYSICS_ANALYSIS.md`, `UI_DESIGN_GUIDE.md` | `docs/reference/`; mark implementation status and date |
| `DEVELOPMENT_ROADMAP.md`, `REVIVAL_PRD.md` | `docs/planning/`; identify superseded plans |
| `FINAL_RESULTS.md`, `ILS_COMPLETE_RESULTS.md`, `ILS_FINAL_STATUS.md`, `ILS_TUNING_FINAL.md`, `ILS_TUNING_SUMMARY.md`, `WAYPOINT_INTERCEPT_RESULTS.md`, `REFACTORING_SUMMARY.md` | `docs/archive/`; preserve historical findings, remove duplicate status claims from active guidance |
| `check_translations.py`, `extract_keys.py`, `extract_nested_keys.py`, `convert_narratives.cjs`, `verify_startup.js` | `scripts/` subdirectories if still maintained; otherwise archive or remove after checking callers |
| `pitch_test_log.txt`, `ils_tuning_results.json`, `telemetry_test_results.json`, `translation_report.txt`, `translation_hardcoded_report.txt`, `scenario.default.csv`, `scenario.default.report.json` | Regenerate into `test-results/`; remove tracked historical output once any baseline value is preserved |
| `autopilot_test_data.csv`, `narrative_keys.txt`, `ntsb_dump.html` | Classify first: intentional fixture → `tests/fixtures/`; curated reference → `docs/reference/`; reproducible scratch output → remove/ignore |

- [ ] Update README links to architecture/API documents, links between moved documents, script-relative paths, and output locations together with each move.
- [ ] Change `scripts/run_scenario.js` default output from the working directory to `test-results/`; retain explicit output overrides. Update translation report writers similarly.
- [ ] Review existing `docs/reference/`, `docs/superpowers/`, and previews before merging archives to avoid duplicate reference sets.

## 3. Ship secondary packs alongside the app

Current behavior differs between the two pack families: scenery ZIPs remain outside `public/`; `AipPackSettings.jsx` references `aip-packs/world-aip-1.1.0.zip` through `new URL(..., import.meta.url)`, so Vite includes that ZIP as an app asset. In addition, `build:local-aip` stages the source CSVs into the deployed app. Separating the ZIP alone therefore does not remove bundled CSV data.

- [ ] Define release deliverables: app bundle; World AIP pack; combined scenery pack OR regional scenery downloads; catalogs/checksums; compatibility notes and notices. Combined scenery and regional packs intentionally overlap and should be presented as alternative download choices.
- [ ] Replace the AIP ZIP asset import with an explicit versioned external download URL or release catalog. Preserve manual file import. Verify the published URL and checksum before release.
- [ ] Choose and document the app's data policy: retain bundled CSVs for built-in local routing, or explicitly implement/test a smaller app that relies on imported packs/cloud fallback. Do not switch to plain `npm run build` merely to reduce size without checking the no-pack experience.
- [ ] Keep `aip-packs/source-overrides/` as reproducible source inputs; current AIP output depends on those snapshots as well as `AIP_DATA/supabase_csv`.
- [ ] Resolve scenery rebuild bootstrapping before excluding ZIPs from Git: the builder can restore ignored source staging from the existing combined ZIP. Provide a pinned, checksum-verified artifact fetch or another durable input source for fresh-checkout builds.
- [ ] Build with `npm run build:aip-packs` and `npm run build:scenery-packs`; compare the generated catalogs' sizes, versions, counts, and hashes with the published files.
- [ ] Exercise real import, reload, offline lookup/rendering, removal, overlapping regions, corrupt archives, downgrade rejection, and storage failure. Keep importer workers and storage migration code in the app.
- [ ] Publish compatibility/version information and retained attribution: OurAirports/source metadata for AIP and OpenStreetMap/ODbL notices and source subsets for scenery.
- [ ] Inspect `dist/` after the chosen deployment build: defaults and intended CSVs present; optional scenery absent; AIP ZIP absent once external hosting is implemented. Check network requests to confirm startup does not download optional packs.

## 4. Remove demonstrably unused code; deprecate compatibility carefully

Search evidence is a candidate list, not proof of safe deletion. Check imports, dynamic loading, scripts, tests, previews, and externally documented use before removing a public entry point.

| Candidate | Evidence and action |
| --- | --- |
| `src/components/ModernAutopilotModule.jsx` | Repository search found its own definition/export and a stale comment in `FlightInProgress.jsx`, with no importer. Confirm replacement controls cover its behavior, then remove the component and stale comment if unused. |
| `src/utils/ParameterValidator.js` | Search found its own definition only. Remove if no dynamic/external consumer or planned supported API exists. |
| `.aircraft-main-panel-legacy-central` and child-position coupling in `AircraftMainPanelReplica.jsx` | Still rendered for selected aircraft. Replace with explicit panel slots/props only after equivalent controls exist and aircraft screenshots verify the result; do not delete the CSS in isolation. |
| Legacy failure-profile fallback in `RealisticFlightPhysicsService.js`; legacy narratives in `sceneManager.js` | Deprecate after catalog/profile coverage is proven. Add focused coverage for fallback users before consolidation. |
| Ambiguous fuel-reserve handling in `aircraftService.js` | Standardize units at input boundaries and migrate saved/legacy callers before removing old interpretations. |
| `pdf-parse`, `dotenv` | Observed in tooling scripts. Consider moving to devDependencies after checking all consumers and build/install environments; retain while maintained pipelines need them. `polygon-clipping` is used by runtime geometry and must remain available. |

- [ ] Preserve active `PhysicsCoordinator`, `usePhysicsLoop`, `RealWeatherService`, `StartupChecklist`, `routeGenerator`, and `DebugPhysicsPanel`: current application imports were found. Decide separately whether debug UI should be gated for release.
- [ ] Preserve save-version handling, failure-ID aliases, and IndexedDB migrations until supported old saves/packs have a tested migration path. The existence of a new implementation does not make these unused.
- [ ] Resolve or disable the incomplete parent-control path marked TODO in `FlightPanelModular.jsx` after verifying reachable UI behavior.
- [x] Inspect generator module loading: both PDF pipelines already define `require` with `createRequire(import.meta.url)`, so their CommonJS dependency loading is intentional. External generation services were not invoked during cleanup.
- [x] Remove `NODE_TLS_REJECT_UNAUTHORIZED=0` from npm commands. Use normal Node certificate configuration when development trust is needed; external generation services remain outside the app release build.
- [ ] Avoid broad physics, routing, or scene-manager rewrites during cleanup. Remove confirmed orphans separately from behavior-changing deprecations.

## 5. Build and release gates

- [ ] Capture the intended changeset and review untracked application files, pack builders, data, and `supabase/migrations/20261021000000_meter_aip_rpc.sql`; the current tree has many untracked release dependencies.
- [ ] Verify from a clean checkout/worktree with the chosen pack-input strategy. Run `npm ci` using the deployment Node version (currently Node 20 in CI).
- [ ] Align package version, UI version, release tag, pack compatibility, and release notes.
- [ ] Run `npm run lint`, `npm test`, `npm run test:aip-route-search`, and `npm run test:scenery-import`. Record skips as well as failures. Prior lint/test results in PREDEPLOY_REVIEW.md do not establish today's status.
- [ ] Run AIP pack tests and quota SQL checks from the full suite; supply the optional disposable PostgreSQL test engine described in `aip-packs/README.md` if that check would otherwise skip.
- [ ] Run `npm run build:local-aip` for the current deployment policy. Confirm staged `public/AIP_DATA` is removed on success and failure, and a failed build cannot publish.
- [ ] Add lint to `.github/workflows/deploy.yml` before deployment; current CI runs tests, route smoke, and the deployment build but omits lint.
- [ ] Preview production output and check deep-link reloads, asset paths, missing configuration/offline startup, dispatch → flight → landing, save/resume, English/Chinese, and keyboard/small-screen use. Verify the custom-domain `base: '/'` matches the actual host.
- [ ] Review/apply required Supabase migrations through the normal migration process before advertising cloud quota enforcement. Run `npm run test:aip-supabase-rpc`; authenticated coverage is optional and consumes credits as documented. Keep credentials out of artifacts and logs.
- [ ] Review `dist/` sizes, notices, data coverage, and browser errors; do not hand-edit generated output. Inspect deployment configuration without publishing during cleanup.
- [ ] Release only when the app, optional downloads, hashes, links, and migration requirements agree. Record an app rollback target and compatible prior pack versions.

Suggested order: fix documentation/ignore policy → relocate reports and references → settle pack input/hosting policy → remove confirmed orphans → run release gates → publish the reviewed artifacts.
