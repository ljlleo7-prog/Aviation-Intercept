import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const key = value => createHash('sha256').update(value).digest('hex');

test('environment credits migration enforces record-only credits, permissions, budgets and usage in PostgreSQL', async context => {
  const db = new PGlite();
  context.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.wallets(id uuid primary key default gen_random_uuid(), user_id uuid unique not null,
      token_balance integer not null check(token_balance >= 0));
    create table public.ledger_entries(id uuid primary key default gen_random_uuid(), user_id uuid, amount integer,
      currency text, operation_type text, description text, created_at timestamptz default now());
    create table public.route_api_call_logs(id uuid primary key default gen_random_uuid(), user_id uuid,
      provider text, status text, charged_tokens integer default 0, created_at timestamptz default now());
    create table public.route_api_call_limits(user_id uuid, window_start timestamptz, call_count integer, primary key(user_id, window_start));
    create schema aip_private;
    create function aip_private.skylinetragedy_search_airports(text, integer, boolean) returns jsonb language sql as $$ select '{"status":"ok","airports":[]}'::jsonb $$;
    grant all on public.wallets, public.ledger_entries, public.route_api_call_logs to authenticated, anon;
    insert into auth.users values ('${alice}'), ('${bob}');
    insert into public.wallets(user_id, token_balance) values ('${alice}', 1000), ('${bob}', 1000);
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261025000000_environment_api_credits.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261025010000_defer_route_api_settlement.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261025020000_daily_api_credit_plan.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261025030000_guest_weather.sql', import.meta.url), 'utf8'));
  const legacyRequest = randomUUID();
  await db.query("insert into api_credit_entries(user_id, request_id, provider, operation, credits) values($1, $2, 'fixture', 'legacy', 10)", [alice, legacyRequest]);
  await db.exec(await readFile(new URL('../supabase/migrations/20261025040000_daily_free_calls.sql', import.meta.url), 'utf8'));
  const queryOne = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const legacy = await queryOne('select recorded_tokens::float8 as recorded, pricing_version from api_credit_entries where request_id = $1', [legacyRequest]);
  assert.equal(legacy.recorded, 0);
  assert.equal(legacy.pricing_version, 'legacy-record-only');
  const reserve = async ({ user = alice, id = randomUUID(), fingerprint = randomUUID(), provider = 'open_elevation', operation = 'elevation', units = 1 } = {}) => {
    const row = await queryOne('select public.reserve_environment_api_call($1, $2, $3, $4, $5, $6) as result',
      [user, id, key(fingerprint), provider, operation, units]);
    return row.result;
  };
  const complete = async (user, id, status = 'ok', data = { results: [{ elevation: 123 }] }, retry = 60) =>
    (await queryOne('select public.complete_environment_api_call($1, $2, $3, $4, $5, $6) as result',
      [user, id, status, JSON.stringify(data), status === 'ok' ? 200 : 429, retry])).result;
  const reset = async () => {
    await db.exec(`reset role;
      truncate public.environment_api_cache, public.environment_api_requests, public.environment_api_counters,
        public.ledger_entries, public.route_api_call_logs, public.api_credit_entries, public.route_api_call_limits, public.guest_weather_cache;
      update public.wallets set token_balance = 1000;
      update public.environment_api_budgets set cooldown_until = null;
      update public.environment_api_budgets set global_month_units = 500 where provider = 'open_elevation';
    `);
  };

  await context.test('records one credit per batch, never debits tokens, and replays without a second credit', async () => {
    await reset();
    const id = randomUUID();
    const first = await reserve({ id, fingerprint: 'same', units: 2 });
    assert.equal(first.status, 'reserved');
    assert.equal(first.billing.chargedTokens, 0);
    assert.equal(first.billing.creditsConsumed, 1);
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [alice])).token_balance, 1000);
    const pending = await reserve({ id, fingerprint: 'same', units: 2 });
    assert.equal(pending.status, 'pending');
    await complete(alice, id);
    const replay = await reserve({ id, fingerprint: 'same', units: 2 });
    assert.equal(replay.status, 'ok');
    assert.equal(replay.billing.chargedTokens, 0);
    assert.equal((await queryOne('select count(*)::int as count from ledger_entries')).count, 0);
    assert.equal((await queryOne('select sum(credits)::int as credits from api_credit_entries')).credits, 1);
    assert.equal((await reserve({ id, fingerprint: 'different' })).status, 'invalid_request');
  });

  await context.test('two accounts coalesce pending work; shared completed cache costs zero', async () => {
    await reset();
    const id = randomUUID();
    assert.equal((await reserve({ id, fingerprint: 'shared' })).status, 'reserved');
    assert.equal((await reserve({ user: bob, fingerprint: 'shared' })).status, 'pending');
    await complete(alice, id);
    const cached = await reserve({ user: bob, fingerprint: 'shared' });
    assert.equal(cached.cached, true);
    assert.equal(cached.billing.chargedTokens, 0);
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [bob])).token_balance, 1000);
  });

  await context.test('zero token balance permits recorded usage; denied limits add no credits', async () => {
    await reset();
    await db.query('update wallets set token_balance = 0 where user_id = $1', [alice]);
    assert.equal((await reserve()).status, 'reserved');
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [alice])).token_balance, 0);
    assert.equal((await queryOne('select count(*)::int as count from ledger_entries')).count, 0);
    await reset();
    await reserve({ units: 20 });
    await reserve({ units: 20 });
    assert.equal((await reserve({ units: 20 })).status, 'user_limit_reached');
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [alice])).token_balance, 1000);
    assert.equal((await reserve({ user: bob, units: 20 })).status, 'reserved');
  });

  await context.test('global budget and provider cooldown block all edge instances before dispatch', async () => {
    await reset();
    await db.exec("update environment_api_budgets set global_month_units = 1 where provider = 'open_elevation'");
    const results = await Promise.all([reserve({ user: alice }), reserve({ user: bob })]);
    assert.deepEqual(results.map(value => value.status).sort(), ['budget_exhausted', 'reserved']);
    assert.equal((await queryOne('select count(*)::int as count from api_credit_entries')).count, 1);
    await reset();
    const id = randomUUID();
    await reserve({ id });
    const failed = await complete(alice, id, 'provider_rate_limited', null, 120);
    assert.equal(failed.billing.chargedTokens, 0);
    assert.equal(failed.billing.creditsConsumed, 1);
    assert.equal((await reserve({ user: bob })).status, 'provider_rate_limited');
    assert.equal((await queryOne('select count(*)::int as count from api_credit_entries')).count, 1);
  });

  await context.test('usage summary isolates users and combines environment and existing route/AIP charges', async () => {
    await reset();
    const id = randomUUID();
    await reserve({ id }); await complete(alice, id);
    await reserve({ user: bob, units: 2 });
    await db.query("insert into route_api_call_logs(user_id, provider, status, charged_tokens) values ($1, 'supabase_aip', 'ok', 1)", [alice]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${alice}', false)`);
    try {
      const usage = (await queryOne('select public.get_api_usage_summary() as result')).result;
      assert.equal(usage.tokenBalance, 1000);
      assert.equal(usage.today.tokens, 1);
      assert.equal(usage.today.credits, 1);
      assert.equal(usage.estimatedTokensPerCredit, 0.2);
      assert.equal(usage.estimatedFutureTokens, 0);
      assert.equal(usage.month.calls, 2);
      assert.equal(usage.recent.length, 2);
      assert.deepEqual(usage.providers.map(row => row.provider).sort(), ['open_elevation', 'supabase_aip']);
      await assert.rejects(db.query('select * from public.environment_api_requests'), /permission denied/);
      await assert.rejects(db.query('update public.wallets set token_balance = 999999'), /permission denied/);
      await assert.rejects(db.query("insert into public.ledger_entries(amount) values (1000)"), /permission denied/);
      await assert.rejects(reserve(), /permission denied/);
      await assert.rejects(db.query('update public.api_credit_policy set estimated_tokens_per_credit = 0'), /permission denied/);
      await assert.rejects(db.query('insert into public.api_credit_entries(credits) values(1)'), /permission denied/);
    } finally { await db.exec('reset role'); }
    await db.exec('set role anon');
    try { await assert.rejects(db.query('select public.get_api_usage_summary()'), /permission denied/); }
    finally { await db.exec('reset role'); }
  });

  await context.test('route and AIP accrue credits with zero balance and preserve token ledger', async () => {
    await reset();
    await db.query('update wallets set token_balance = 0 where user_id = $1', [alice]);
    const route = await queryOne('select * from public.reserve_route_api_call($1, 10, 1, $2, null, null)', [alice, 'FlightPlanDB']);
    assert.equal(route.status, 'ok');
    assert.equal(route.charged_tokens, 0);
    await db.exec(`select set_config('request.jwt.claim.sub', '${alice}', false)`);
    const aip = (await queryOne("select public.skylinetragedy_search_airports('ZBAA', 20, true) as result")).result;
    assert.equal(aip.billing.chargedTokens, 0);
    assert.equal(aip.billing.creditsConsumed, 1);
    assert.equal((await queryOne('select sum(credits)::int as credits from api_credit_entries')).credits, 2);
    assert.equal((await queryOne('select count(*)::int as count from ledger_entries')).count, 0);
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [alice])).token_balance, 0);
  });

  await context.test('future rate changes do not reprice recorded charges or debit balances', async () => {
    await reset();
    await db.query("insert into api_credit_entries(user_id, request_id, provider, operation, credits) values($1, $2, 'fixture', 'test', 50)", [alice, randomUUID()]);
    await reserve();
    await db.exec(`select set_config('request.jwt.claim.sub', '${alice}', false)`);
    let summary = (await queryOne('select get_api_usage_summary() as result')).result;
    assert.equal(summary.totalCredits, 51);
    assert.equal(summary.recordedTokensDue, 0.2);
    await db.exec('update api_credit_policy set estimated_tokens_per_credit = 0.4, updated_at = now()');
    summary = (await queryOne('select get_api_usage_summary() as result')).result;
    assert.equal(summary.recordedTokensDue, 0.2);
    await reserve();
    summary = (await queryOne('select get_api_usage_summary() as result')).result;
    assert.equal(summary.recordedTokensDue, 0.6);
    assert.equal(summary.tokenBalance, 1000);
    await db.exec('update api_credit_policy set estimated_tokens_per_credit = 0.2');
  });

  await context.test('invalid reservation cannot change wallets and failed finalization is idempotent', async () => {
    await reset();
    await assert.rejects(reserve({ units: 0 }), /Invalid environment reservation/);
    await assert.rejects(reserve({ provider: 'arbitrary_url' }), /Invalid environment reservation/);
    const id = randomUUID();
    await reserve({ id });
    await complete(alice, id, 'provider_failed', null);
    await complete(alice, id, 'provider_failed', null);
    assert.equal((await queryOne('select count(*)::int as count from api_credit_entries')).count, 1);
    assert.equal((await queryOne('select count(*)::int as count from environment_api_cache')).count, 0);
  });

  const seedCredits = async (user, credits) => db.query("insert into api_credit_entries(user_id, request_id, provider, operation, credits) values($1, $2, 'fixture', 'test', $3)", [user, randomUUID(), credits]);
  const daily = async user => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    return (await queryOne('select get_daily_api_credit_usage() as result')).result.dailyPlan;
  };
  await context.test('calls 1–50 are recorded free across providers; calls 51+ accrue exactly 0.2 tokens', async () => {
    await reset();
    await seedCredits(alice, 49);
    const route = await queryOne('select * from reserve_route_api_call($1, 10, 1, $2, null, null)', [alice, 'FlightPlanDB']);
    assert.equal(route.status, 'ok');
    let plan = await daily(alice);
    assert.equal(plan.used, 50);
    assert.equal(plan.freeRemaining, 0);
    assert.equal(plan.recordedTokenCharge, 0);
    await reserve();
    const aip = (await queryOne("select skylinetragedy_search_airports('ZBAA', 20, true) as result")).result;
    assert.equal(aip.billing.chargedTokens, 0);
    plan = await daily(alice);
    assert.equal(plan.used, 52);
    assert.equal(plan.billableCredits, 2);
    assert.equal(plan.recordedTokenCharge, 0.4);
    const summary = (await queryOne('select get_api_usage_summary() as result')).result;
    assert.equal(summary.today.freeCredits, 50);
    assert.equal(summary.today.billableCredits, 2);
    assert.equal(summary.recordedTokensDue, 0.4);
    assert.ok(summary.recent.some(row => row.recorded_tokens === 0.2));
    assert.equal(summary.tokenBalance, 1000);
    assert.equal((await queryOne('select count(*)::int as count from ledger_entries')).count, 0);
  });

  await context.test('maximum daily recorded charge is 390 tokens and the free allowance resets each UTC day', async () => {
    await reset();
    await seedCredits(alice, 2000);
    let plan = await daily(alice);
    assert.equal(plan.freeLimit, 50);
    assert.equal(plan.billableCredits, 1950);
    assert.equal(plan.recordedTokenCharge, 390);
    assert.equal((await reserve()).status, 'daily_limit_reached');
    await db.exec("update api_credit_entries set created_at = ((date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '1 second')");
    await reserve();
    plan = await daily(alice);
    assert.equal(plan.used, 1);
    assert.equal(plan.freeRemaining, 49);
    assert.equal(plan.recordedTokenCharge, 0);
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [alice])).token_balance, 1000);
  });
  await context.test('default 2000-credit cap covers environment, routes and AIP; caches and replay stay free at the cap', async () => {
    await reset();
    await seedCredits(alice, 1999);
    const id = randomUUID();
    assert.equal((await reserve({ id, fingerprint: 'last-credit' })).status, 'reserved');
    await complete(alice, id);
    assert.equal((await reserve({ provider: 'open_meteo', operation: 'weather_radar' })).status, 'daily_limit_reached');
    const route = await queryOne('select * from reserve_route_api_call($1, 10, 1, $2, null, null)', [alice, 'FlightPlanDB']);
    assert.equal(route.status, 'daily_limit_reached');
    await daily(alice);
    const aip = (await queryOne("select skylinetragedy_search_airports('ZBAA', 20, true) as result")).result;
    assert.equal(aip.status, 'daily_limit_reached');
    assert.equal((await reserve({ id, fingerprint: 'last-credit' })).billing.creditsConsumed, 0);
    assert.equal((await reserve({ fingerprint: 'last-credit' })).cached, true);
    assert.equal((await reserve({ user: bob })).status, 'reserved');
    const plan = await daily(alice);
    assert.equal(plan.limit, 2000);
    assert.equal(plan.used, 2000);
    assert.equal(plan.remaining, 0);
    assert.equal(plan.percentUsed, 100);
    assert.equal(new Date(plan.resetsAt).getUTCHours(), 0);
    assert.equal((await queryOne('select token_balance from wallets where user_id = $1', [alice])).token_balance, 1000);
    assert.equal((await queryOne('select count(*)::int as count from ledger_entries')).count, 0);
    assert.equal((await queryOne("select count(*)::int as count from environment_api_counters where provider = 'open_meteo'")).count, 0);
    assert.equal((await queryOne('select count(*)::int as count from route_api_call_limits')).count, 0);
  });

  await context.test('competing gateway families cannot spend the last daily credit twice', async () => {
    await reset();
    await seedCredits(alice, 1999);
    const [environment, route] = await Promise.all([
      reserve(), queryOne('select * from reserve_route_api_call($1, 10, 1, $2, null, null)', [alice, 'FlightPlanDB'])
    ]);
    assert.deepEqual([environment.status, route.status].sort(), ['daily_limit_reached', 'reserved']);
    assert.equal((await daily(alice)).used, 2000);
  });

  await context.test('UTC day rollover excludes yesterday and summary exposes the same daily allowance', async () => {
    await reset();
    await seedCredits(alice, 2000);
    await db.exec("update api_credit_entries set created_at = ((date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '1 second')");
    assert.equal((await daily(alice)).used, 0);
    assert.equal((await reserve()).status, 'reserved');
    const summary = (await queryOne('select get_api_usage_summary() as result')).result;
    assert.equal(summary.dailyPlan.used, 1);
    assert.equal(summary.dailyPlan.remaining, 1999);
    assert.equal(summary.dailyPlan.percentUsed, 0.05);
    assert.equal(summary.totalCredits, 2001);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${bob}', false)`);
    try {
      assert.equal((await queryOne('select get_daily_api_credit_usage() as result')).result.dailyPlan.used, 0);
      await assert.rejects(db.query('update api_credit_policy set daily_credit_limit = 999999'), /permission denied/);
      await assert.rejects(db.query('select reserve_environment_api_call_before_daily_plan($1,$2,$3,$4,$5,$6)', [bob, randomUUID(), key('forged'), 'open_elevation', 'elevation', 1]), /permission denied/);
    } finally { await db.exec('reset role'); }
    await db.exec('set role anon');
    try { await assert.rejects(db.query('select get_daily_api_credit_usage()'), /permission denied/); }
    finally { await db.exec('reset role'); }
  });

  await context.test('guest weather is free, shares coarse cache, and enforces per-IP/provider-pool limits', async () => {
    await reset();
    const guest = key('guest-ip');
    const id = randomUUID();
    const fingerprint = key('guest-coarse-weather');
    const reserveGuest = async (guestKey = guest, requestKey = randomUUID()) => (await queryOne(
      'select reserve_guest_weather_api_call($1, $2, $3) as result', [guestKey, randomUUID(), key(requestKey)])).result;
    const first = (await queryOne('select reserve_guest_weather_api_call($1, $2, $3) as result', [guest, id, fingerprint])).result;
    assert.equal(first.status, 'reserved');
    assert.equal(first.billing.creditsConsumed, 0);
    assert.equal((await reserveGuest()).status, 'user_limit_reached');
    assert.equal((await queryOne('select count(*)::int as count from api_credit_entries')).count, 0);
    await db.query("select complete_guest_weather_api_call($1, $2, $3, 'ok', $4, 60)",
      [guest, id, fingerprint, JSON.stringify({ current: { cloud_cover: 80, precipitation: 1 } })]);
    const cached = (await queryOne('select reserve_guest_weather_api_call($1, $2, $3) as result', [key('another-ip'), randomUUID(), fingerprint])).result;
    assert.equal(cached.cached, true);
    assert.equal(cached.billing.chargedTokens, 0);
    assert.equal((await queryOne("select units from environment_api_counters where scope = 'global' and provider = 'open_meteo' and bucket = 'day'")).units, 1);
    await db.exec("update environment_api_counters set units = 800 where scope = 'guest-pool' and bucket = 'day'");
    assert.equal((await reserveGuest(key('other-ip'))).status, 'budget_exhausted');
    assert.equal((await reserve({ provider: 'open_meteo', operation: 'weather_current' })).status, 'reserved');
    await db.exec('set role anon');
    try { await assert.rejects(reserveGuest(), /permission denied/); }
    finally { await db.exec('reset role'); }
  });
});
