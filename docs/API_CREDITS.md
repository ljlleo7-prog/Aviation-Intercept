# API credits: record now, settle later

Live terrain, terrain fallback and signed-in weather go through the authenticated
`environment-api-gateway`. Online guests can request coarse public weather only.
Routes and cloud AIP retain their existing guarded
entry points and now use the same credit ledger. Browser direct-provider
fallbacks are disabled. No tokens are debited by the new accounting paths and a
positive token balance is not required. Existing historical token transactions
are retained; this change does not refund or convert earlier payments.

One dispatched signed-in environment lookup records **one credit**, including a terrain
batch of up to 20 coordinates. A route or cloud AIP lookup also records one
credit. Route providers may perform multiple underlying HTTP operations for one
logical lookup. Cached results, shared pending requests, idempotent replays,
authentication failures, invalid payloads and quota denials add no credits.
Dispatched attempts still count if a provider fails or the browser cancels.

Offline route search uses imported packs first, then free app-owned bundled AIP
CSV assets, then built-in fallback. Bundled CSV requests are static asset reads,
not provider API calls, and consume no credits. Cloud AIP, airport enrichment,
external CSV sources and external route providers stay blocked offline. Live
terrain, routes and cloud AIP require login. Read-only account usage is loaded
only online with login.

The first **50 metered calls per UTC day are free but recorded**. Further calls
record **0.2 token each for later payment**. Nothing is deducted from the token
wallet now. The 2,000-credit daily cap includes the free calls, so at the current
rate the maximum recorded daily charge is `(2000 - 50) × 0.2 = 390` tokens.
Cached results and guest weather remain outside billing. No payment, auto-debit,
token purchase or collection mechanism is enabled. Existing record-only history
is not retroactively billed when this plan is introduced.

Settings is a full page from the main menu and cockpit sidebar. It shows the
current token balance, recorded credits, today's/monthly calls and credits,
provider breakdown, recent calls, remaining free calls and recorded token charges.
Historical token charges are identified separately. During a flight the cockpit
remains mounted and physics/keyboard controls pause until the player returns.

## Enforcement

The default plan is **2,000 credits per user per UTC day**, across all metered
providers. A trigger on the shared credit ledger takes a per-user transaction
lock before checking the day's sum, so competing gateway families cannot spend
the final credit twice. Denials roll back earlier reservation counter changes.
The cap resets at 00:00 UTC. Cached results and idempotent replays stay free even
at the cap; provider/user budgets can stop requests earlier.

Online mode adds the used percentage to the FPS tab, for example
`60 FPS · 50% daily`. It reads a small account-scoped RPC after API activity and
every 30 seconds while visible. Offline mode hides the percentage and makes no
usage queries. Signed-out or unavailable/expired usage shows `—% daily`, never a
misleading zero. Settings shows the daily allowance, remainder and reset time.

Only trusted server code can reserve and record calls. The gateway verifies the
JWT, validates operations/coordinates/batch size, constructs allowlisted upstream
URLs and records a reservation before dispatch. SQL functions use transaction
locks to enforce global provider budgets and per-user caps across edge instances.
Request IDs prevent double recording; shared cache leases coalesce matching
requests across users. Usage is derived from the authenticated user inside SQL.
Clients cannot write wallets, credit entries, ledgers, quota counters or rates.

The environment budgets count provider units independently of credits:
Open-Elevation counts coordinates; the other global budgets count HTTP calls.
Per-user terrain limits count coordinates. A 20-coordinate batch is one credit
but may consume 20 provider quota units. Defaults are deliberately conservative
and must be reviewed against the actual provider plans before activation.

Public-provider availability and application-level blocks still cannot be
guaranteed. These controls bound legitimate application traffic; they do not
replace edge/WAF ingress limits against request floods or multi-account abuse.

## Guest weather exception

Online guests get free weather with a fixed **0.25°** grid, a **60-second** radar
request interval and **20 NM** range. Current weather updates every five minutes.
The gateway enforces coarse cell-center coordinates even if a client submits
finer ones; radar and current weather share a five-minute guest cache. Guest
weather controls are fixed until login. Offline mode uses simulated weather.

Provider calls are capped at one per UTC minute and 120 per UTC day per ingress
IP hash. The combined guest pool is capped at 10/minute and 800/day and also
consumes the overall Open-Meteo provider budget. Thus guest traffic can use at
most 10% of the default 8,000-call daily weather budget. No account credits or
tokens are recorded for guests. Ingress must overwrite forwarded-IP headers so
clients cannot choose their identity; only secret-salted hashes are stored.
Missing trusted ingress identity blocks guest requests.

## Deployment

Deploy the backend before the frontend. These files are implementation artifacts;
local tests do not apply them to a live database.

1. Review and apply all five new migrations in order:
   `20261025000000_environment_api_credits.sql`, then
   `20261025010000_defer_route_api_settlement.sql`,
   `20261025020000_daily_api_credit_plan.sql`,
   `20261025030000_guest_weather.sql`, and
   `20261025040000_daily_free_calls.sql`.
2. Deploy `environment-api-gateway` and the updated `route-provider-gateway`.
   Deploy the environment gateway with `--no-verify-jwt` to permit guest weather;
   its handler verifies user JWTs itself for privileged operations and permits
   only coarse weather without a user. Keep platform JWT verification enabled
   on the route gateway. Existing Supabase URL/service-role secrets are
   used only on the server; do not put service-role or provider secrets in Vite.
3. Review `environment_api_budgets` and `route_api_credit_budgets` against the
   deployment's provider plans, then deploy the frontend.
4. Verify with a test account that a live lookup records one credit, leaves token
   balance unchanged and appears in Settings; repeat it to verify a free cache hit.

The first migration assumes the existing `wallets` and `ledger_entries` schema
used by earlier route migrations. Revoking browser writes also applies to shared
wallet/ledger tables; confirm other applications use trusted server functions.
Missing backend configuration or migrations blocks environment calls rather than
allowing direct provider access. Missing login permits only the coarse, capped
guest-weather exception.

## Adjusting future call pricing

Review aggregate provider counters and credit entries with administrator access,
then update the server policy. Clients cannot change it. Each entry stores its
rate and free/billable portion when recorded. Future rate changes do not reprice
earlier charges or change token balances:

```sql
update public.api_credit_policy
set estimated_tokens_per_credit = 0.2, daily_free_credits = 50, updated_at = now()
where singleton;
```

The legacy column name `estimated_tokens_per_credit` now holds the rate for
additional billable calls. There is no automatic pricing or collection mechanism.

## Trip planning estimate

Before budget stops, shared cache savings, latency and fallback attempts, a
continuously busy grid at the default two-second interval can dispatch 30 calls
per minute. A two-hour flight therefore has a demand estimate of up to 3,600
terrain calls plus about 24 current-weather lookups. Continuous weather radar
can add up to another 3,600 calls. Route/AIP setup calls and uncached point-ground
lookups can add usage. These are rate-based planning estimates, not measured
full-trip consumption or complete terrain-coverage guarantees. The conservative
default provider/user caps can stop live fetching much earlier.

## Verification

`npm test` includes PostgreSQL execution of all five migrations using the development
dependency PGlite. Tests cover zero-balance access, no wallet/ledger debits,
one-credit batching, cache/replay deduplication, quota denials, access controls,
existing route/AIP accrual, user isolation, the free-call boundary and preserving
recorded charges when future pricing changes.
PGlite queues concurrent queries on one PostgreSQL connection; this verifies SQL
behavior and atomic reservations, not a distributed load test.

Gateway/client tests mock all external providers. No test spends provider quota
or changes a production wallet.
