# Release preparation

Target: https://aviation.geeksproductionstudio.com/ (Vite base `/`). No publication is authorized yet. The Pages workflow is manual-only; pushing feature work no longer triggers deployment. Do not run the deployment workflow or `npm run deploy` until the release is approved.

## Local review artifacts

Run `npm ci`, `npm run lint`, `npm test`, `npm run test:aip-route-search`, and `npm run test:scenery-import`. Then run `npm run stage:release` to build the app and stage checksum-verified existing pack archives alongside it. This command does not publish. The ignored `release-artifacts/` directory contains `app/`, `aip-packs/`, `scenery-packs/`, and `SHA256SUMS`; the staging script refuses to overwrite an existing review set. Move that directory aside before staging a later candidate.

The app retains bundled AIP CSVs for its existing local route fallback. Optional ZIPs are separate artifacts. Set `VITE_AIP_PACK_DOWNLOAD_URL` to the reviewed, versioned external ZIP URL before building when downloads are available; without it, manual import remains available and the download link is hidden. No hosting URL is assumed. Deploy only `app/`; optional pack directories can accompany the release on a download host.

Rebuild changed data with `npm run build:aip-packs` and `npm run build:scenery-packs` before staging. Keep AIP source overrides and pack catalogs in Git. Retain the combined scenery ZIP as a bootstrap input until a durable external source archive is arranged: a fresh checkout without ignored scenery-source staging needs that ZIP to rebuild offline. Do not broadly ignore all ZIPs yet.

See [AIP pack instructions](../aip-packs/README.md), [scenery pack instructions](../scenery-packs/README.md), and the [remaining checklist](PRE_RELEASE_CLEANUP_CHECKLIST.md). Cloud migrations, DNS, authentication redirect configuration, browser playthroughs, and production download-link validation remain release work; cleanup does not apply migrations or change live services.

## Cleanup decisions

Root reference documents were consolidated under `docs/reference/`, historical results under `docs/archive/`, and plans under `docs/planning/`. Former root diagnostic output is preserved locally in ignored `test-results/pre-cleanup/`; scenario and translation tools now write reports under `test-results/`. Root extraction/localization tools moved to `scripts/`. The isolated mock startup verifier and one-time narrative converter are deprecated under `scripts/archive/`; neither is a release validation or content-generation tool.

Removed the unreferenced `ModernAutopilotModule.jsx` and `ParameterValidator.js`. Active panel fallbacks, failure aliases, save compatibility, and IndexedDB migrations remain supported. Maintained previews and existing in-progress changes remain in place. Agent-specific notes remain at root for tool discovery.

The PDF pipelines already use `createRequire(import.meta.url)` correctly; the earlier checklist concern about bare CommonJS usage does not apply. Certificate verification is enabled in their npm commands; custom development trust should use the normal Node certificate configuration.

## Verification on 2026-10-23

Local checks used Node 22.16.0; CI targets Node 20, so repeat the release gates there before publishing.

- Production build and local artifact staging passed. Ten optional archives matched their catalog sizes and SHA-256 values. The app retains CSV fallback data and excludes optional ZIPs. Large JavaScript chunk warnings remain.
- Full Node suite: 466 passed, 3 failed, 1 skipped (470 tests). Failures are in `tests/autopilot_basic.test.js`: predictive throttle final-speed error (17.6 kt versus 10 kt limit), wind IAS drift (-1.02 kt versus 1 kt), and stronger-wind IAS drift (1.63 kt versus 1 kt). No physics or autopilot behavior was changed by cleanup; these failures remain release blockers.
- Full lint: 1,478 errors and 27 warnings. Lint now gates the manual deployment workflow. Focused lint for the changed AIP settings component and new staging script passed.
- AIP route smoke: 6 passed, 1 skipped. Scenery import/migration checks: 16 passed. AIP pack checks: 4 passed. The optional SQL engine check was skipped in the full suite; no cloud migration or authenticated paid RPC check was run.
- Moved Python tools pass syntax checks, and the translation audit writes outside root. Its existing parser cannot fully parse the current locale JavaScript, so its success exit code is not proof of translation completeness.

Verification logs are retained locally under `test-results/cleanup/`. Browser playthroughs, DNS/authentication configuration, production pack hosting, and the failed release gates remain outstanding.
