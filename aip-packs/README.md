# Optional local AIP data

`world-aip-1.1.0.zip` contains 85,484 airports (including runway and frequency records), 11,010 navaids, and the route lookup, leg, reference-point and edge indexes. Version 1.1.0 also preserves all 13 Supabase source tables as CSVs, including route tokens, route catalog, airport index, regions and source metadata. The manifest and catalog record source row counts. Older 1.0.0 imports still work, but reimport 1.1.0 for complete source coverage. It uses the same source CSVs as the Supabase import; no Supabase records are deleted. This reduces cloud traffic, not the storage occupied by retained cloud tables. ZIP compression and the absence of PostgreSQL index/row overhead explain the smaller download size.

In Settings → Display → AIP data packs, download the ZIP, import it, then reload. Data is stored in this browser's IndexedDB. Airport searches, details, nearby airports, suitable airports, navaids and local route searches use the installed data without cloud calls or credits. Installed route data takes precedence over the remote-first preference; explicitly external-only routing still uses external providers. Removing the pack requires a reload. Clearing browser data removes it.

The 2026-10-21 live audit found 2,465 route catalog rows and 16 source metadata rows, compared with 2,392 and 14 in the repository exports. Complete live snapshots of those two tables are kept in `source-overrides/`; the other 11 live table row counts matched the repository exports. The builder prefers these snapshots and retains all their columns. Matching row counts alone does not prove identical field values for the other tables.

Rebuild from `AIP_DATA/supabase_csv` plus `source-overrides/` with `npm run build:aip-packs`. The builder validates the archive and writes `catalog.json` with counts and the archive SHA-256. The ZIP manifest includes individual data-file checksums. Import rejects missing, unexpected or corrupt entries and stores the replacement atomically. The ZIP is staged separately from the app with `npm run stage:release`. Set `VITE_AIP_PACK_DOWNLOAD_URL` to its reviewed external URL before building to enable the download link. Manual file import works without that setting. The deployment build still includes the CSV data needed by the existing local route fallback.

## Cloud quota migration

Apply `supabase/migrations/20261021000000_meter_aip_rpc.sql` after the existing AIP and route-limit migrations using your normal Supabase migration process. **Cloud quota enforcement requires applying this migration.** It keeps AIP data in Supabase and wraps all six AIP RPCs with authenticated, atomic wallet debits and the existing shared route API quota:

- One TOKEN credit per cloud request, including searches returning no results; ten accepted requests per UTC calendar minute per user, shared with route API requests.
- Anonymous, exhausted-wallet and over-quota requests cannot execute the underlying lookup and cost zero credits. SQL failures roll back the debit.
- Ledger entries and route API logs record charged calls. Direct AIP table access, private implementation calls and client calls to the credit reservation helper are revoked to prevent bypass.
- Browser RPC results are cached for 15 minutes per user and simultaneous identical calls are coalesced. Cached/shared responses do not debit again. Offline mode disables cloud AIP requests.

The quota concerns cloud **AIP lookup RPCs**; it does not meter unrelated Supabase features such as login or multiplayer.

`npm run test:aip-supabase-rpc` verifies anonymous access is denied. Optionally set `AIP_TEST_ACCESS_TOKEN` to an authenticated user's JWT to exercise paid calls too (four credits with sufficient quota and balance). Never commit the token.

SQL regression checks can run against a disposable embedded PostgreSQL instance:

```sh
npm install --prefix /tmp/aip-quota-verification --no-audit --no-fund @electric-sql/pglite
AIP_TEST_PGLITE_MODULE=/tmp/aip-quota-verification/node_modules/@electric-sql/pglite/dist/index.js node --test tests/aip_quota_sql.test.js
```

The fixture tests the production migration with stub lookup functions and wallets; it never connects to Supabase. Without the optional test engine this test is skipped.

Airport/navaid source: OurAirports public-domain data. Route attribution is retained in the bundle's NOTICE and source metadata. This simulator dataset is not for real navigation.
