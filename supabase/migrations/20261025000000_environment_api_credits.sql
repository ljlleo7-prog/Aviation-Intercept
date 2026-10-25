-- Record API credits now; token settlement is deferred. Existing token balances are never changed.
-- Requires the application's existing public.wallets and public.ledger_entries.
begin;

-- Wallet/ledger mutations must come from trusted server functions. Browser DML
-- would let a user mint their own credits or forge consumption history.
revoke insert, update, delete on public.wallets, public.ledger_entries, public.route_api_call_logs from public, anon, authenticated;

create table public.api_credit_policy (
  singleton boolean primary key default true check(singleton),
  estimated_tokens_per_credit numeric(12, 6) not null default 0.5 check(estimated_tokens_per_credit >= 0),
  updated_at timestamptz not null default now()
);
insert into public.api_credit_policy(singleton) values(true);
create table public.api_credit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  provider text not null,
  operation text not null,
  credits integer not null check(credits > 0),
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);
create index api_credit_entries_usage_idx on public.api_credit_entries(user_id, created_at desc);
alter table public.api_credit_entries enable row level security;
alter table public.api_credit_policy enable row level security;
revoke all on public.api_credit_entries, public.api_credit_policy from public, anon, authenticated;
grant all on public.api_credit_entries, public.api_credit_policy to service_role;

create table public.environment_api_budgets (
  provider text primary key check (provider in ('open_elevation', 'open_topo_data', 'open_meteo')),
  global_minute_units integer not null check (global_minute_units > 0),
  global_day_units integer not null check (global_day_units > 0),
  global_month_units integer not null check (global_month_units > 0),
  user_minute_calls integer not null check (user_minute_calls > 0),
  user_day_units integer not null check (user_day_units > 0),
  user_month_units integer not null check (user_month_units > 0),
  cooldown_until timestamptz
);
-- Open-Elevation units are coordinates; other global budgets count HTTP calls.
-- User quota units count terrain coordinates or weather lookups; one dispatched call records one credit.
-- Conservative defaults: operators must review them against their provider plan.
insert into public.environment_api_budgets values
  ('open_elevation', 100, 500, 500, 10, 50, 50, null),
  ('open_topo_data', 30, 800, 24000, 10, 100, 3000, null),
  ('open_meteo', 120, 8000, 240000, 20, 500, 15000, null);

create table public.environment_api_counters (
  scope text not null,
  provider text not null references public.environment_api_budgets(provider),
  bucket text not null check (bucket in ('minute', 'day', 'month')),
  window_start timestamptz not null,
  units integer not null default 0 check (units >= 0),
  calls integer not null default 0 check (calls >= 0),
  primary key (scope, provider, bucket, window_start)
);

create table public.environment_api_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_key text not null,
  provider text not null,
  operation text not null,
  units integer not null,
  charged_tokens integer not null default 0 check(charged_tokens = 0),
  credits_consumed integer not null default 0 check(credits_consumed in (0, 1)),
  status text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, request_id)
);
create index environment_api_requests_usage_idx on public.environment_api_requests(user_id, created_at desc);

create table public.environment_api_cache (
  request_key text primary key,
  user_id uuid not null,
  request_id uuid not null,
  status text not null check (status in ('pending', 'ok')),
  data jsonb,
  expires_at timestamptz not null
);

alter table public.environment_api_budgets enable row level security;
alter table public.environment_api_counters enable row level security;
alter table public.environment_api_requests enable row level security;
alter table public.environment_api_cache enable row level security;
revoke all on public.environment_api_budgets, public.environment_api_counters,
  public.environment_api_requests, public.environment_api_cache from public, anon, authenticated;
grant all on public.environment_api_budgets, public.environment_api_counters,
  public.environment_api_requests, public.environment_api_cache to service_role;

create function public.reserve_environment_api_call(
  p_user_id uuid, p_request_id uuid, p_request_key text,
  p_provider text, p_operation text, p_units integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_request public.environment_api_requests%rowtype;
  v_cache public.environment_api_cache%rowtype;
  v_budget public.environment_api_budgets%rowtype;
  v_result jsonb;
  v_units integer;
  v_start timestamptz;
  v_bucket text;
  v_global_units integer;
  v_user_units integer;
  v_user_calls integer;
  v_limit integer;
begin
  if p_user_id is null or p_request_id is null or p_request_key !~ '^[a-f0-9]{64}$'
    or p_request_key is null or p_units is null or p_units < 1 or p_units > 20
    or not ((p_provider in ('open_elevation', 'open_topo_data') and p_operation = 'elevation')
      or (p_provider = 'open_meteo' and p_operation in ('weather_radar', 'weather_current') and p_units = 1))
    or p_provider is null or p_operation is null then
    raise exception 'Invalid environment reservation';
  end if;
  -- Serializes short reservations across edge instances, before checking wallets,
  -- caches and budgets. No network requests run while this lock is held.
  perform pg_advisory_xact_lock(hashtextextended('environment_api_reservation', 0));

  select * into v_request from public.environment_api_requests
    where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_request.request_key <> p_request_key then
      return jsonb_build_object('status', 'invalid_request', 'billing', jsonb_build_object('chargedTokens', 0));
    end if;
    return coalesce(v_request.result, jsonb_build_object('status', 'pending', 'retryAfterSeconds', 2))
      || jsonb_build_object('replayed', true, 'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 0, 'originalCreditsConsumed', v_request.credits_consumed));
  end if;

  select * into v_cache from public.environment_api_cache where request_key = p_request_key;
  if found and v_cache.expires_at > now() then
    if v_cache.status = 'pending' then
      return jsonb_build_object('status', 'pending', 'retryAfterSeconds', 2, 'billing', jsonb_build_object('chargedTokens', 0));
    end if;
    v_result := jsonb_build_object('status', 'ok', 'data', v_cache.data, 'cached', true,
      'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 0));
    insert into public.environment_api_requests(user_id, request_id, request_key, provider, operation, units, status, result, completed_at)
      values(p_user_id, p_request_id, p_request_key, p_provider, p_operation, p_units, 'cached', v_result, now());
    return v_result;
  end if;

  select * into v_budget from public.environment_api_budgets where provider = p_provider;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  if v_budget.cooldown_until > now() then
    return jsonb_build_object('status', 'provider_rate_limited', 'retryAfterSeconds', ceil(extract(epoch from v_budget.cooldown_until - now())),
      'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  v_units := case when p_provider = 'open_elevation' then p_units else 1 end;
  foreach v_bucket in array array['minute', 'day', 'month'] loop
    v_start := date_trunc(v_bucket, now() at time zone 'UTC') at time zone 'UTC';
    select coalesce(sum(units), 0) into v_global_units from public.environment_api_counters
      where scope = 'global' and provider = p_provider and bucket = v_bucket and window_start = v_start;
    select coalesce(sum(units), 0), coalesce(sum(calls), 0) into v_user_units, v_user_calls from public.environment_api_counters
      where scope = p_user_id::text and provider = p_provider and bucket = v_bucket and window_start = v_start;
    v_limit := case v_bucket when 'minute' then v_budget.global_minute_units
      when 'day' then v_budget.global_day_units else v_budget.global_month_units end;
    if v_global_units + v_units > v_limit then
      return jsonb_build_object('status', 'budget_exhausted', 'retryAfterSeconds', 300,
        'billing', jsonb_build_object('chargedTokens', 0));
    end if;
    if (v_bucket = 'minute' and v_user_calls + 1 > v_budget.user_minute_calls)
      or (v_bucket = 'day' and v_user_units + p_units > v_budget.user_day_units)
      or (v_bucket = 'month' and v_user_units + p_units > v_budget.user_month_units) then
      return jsonb_build_object('status', 'user_limit_reached', 'retryAfterSeconds', 60,
        'billing', jsonb_build_object('chargedTokens', 0));
    end if;
  end loop;

  insert into public.api_credit_entries(user_id, request_id, provider, operation, credits)
    values(p_user_id, p_request_id, p_provider, p_operation, 1);
  foreach v_bucket in array array['minute', 'day', 'month'] loop
    v_start := date_trunc(v_bucket, now() at time zone 'UTC') at time zone 'UTC';
    insert into public.environment_api_counters(scope, provider, bucket, window_start, units, calls)
      values('global', p_provider, v_bucket, v_start, v_units, 1),
        (p_user_id::text, p_provider, v_bucket, v_start, p_units, 1)
      on conflict (scope, provider, bucket, window_start) do update
        set units = environment_api_counters.units + excluded.units, calls = environment_api_counters.calls + 1;
  end loop;
  insert into public.environment_api_requests(user_id, request_id, request_key, provider, operation, units, credits_consumed, status)
    values(p_user_id, p_request_id, p_request_key, p_provider, p_operation, p_units, 1, 'pending');
  insert into public.environment_api_cache(request_key, user_id, request_id, status, expires_at)
    values(p_request_key, p_user_id, p_request_id, 'pending', now() + interval '60 seconds')
    on conflict (request_key) do update set user_id = excluded.user_id, request_id = excluded.request_id,
      status = 'pending', data = null, expires_at = excluded.expires_at;
  return jsonb_build_object('status', 'reserved', 'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred'));
end;
$$;

create function public.complete_environment_api_call(
  p_user_id uuid, p_request_id uuid, p_status text, p_data jsonb,
  p_upstream_status integer, p_retry_after_seconds integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_request public.environment_api_requests%rowtype;
  v_result jsonb;
  v_balance integer;
begin
  if p_status is null or p_status not in ('ok', 'provider_failed', 'provider_rate_limited') then
    raise exception 'Invalid completion status';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('environment_api_reservation', 0));
  select * into v_request from public.environment_api_requests where user_id = p_user_id and request_id = p_request_id for update;
  if not found then raise exception 'Missing reservation'; end if;
  if v_request.status <> 'pending' then return v_request.result; end if;
  select token_balance into v_balance from public.wallets where user_id = p_user_id;
  v_result := jsonb_build_object('status', p_status, 'upstreamStatus', p_upstream_status,
    'retryAfterSeconds', case when p_status = 'ok' then 0 else greatest(30, least(coalesce(p_retry_after_seconds, 30), 2678400)) end,
    'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', v_request.credits_consumed, 'tokenBalance', coalesce(v_balance, 0), 'settlement', 'deferred'));
  if p_status = 'ok' then v_result := v_result || jsonb_build_object('data', p_data); end if;
  update public.environment_api_requests set status = p_status, result = v_result, completed_at = now()
    where user_id = p_user_id and request_id = p_request_id;
  if p_status = 'ok' then
    update public.environment_api_cache set status = 'ok', data = p_data,
      expires_at = now() + case when v_request.operation = 'elevation' then interval '30 days' else interval '5 minutes' end
      where request_key = v_request.request_key and user_id = p_user_id and request_id = p_request_id;
  else
    delete from public.environment_api_cache where request_key = v_request.request_key and user_id = p_user_id and request_id = p_request_id;
    update public.environment_api_budgets set cooldown_until = greatest(coalesce(cooldown_until, now()),
      now() + make_interval(secs => greatest(30, least(coalesce(p_retry_after_seconds, 30), 2678400))))
      where provider = v_request.provider;
  end if;
  return v_result;
end;
$$;

-- Derive identity inside the RPC; clients cannot request another user's usage.
create function public.get_api_usage_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  with events as (
    select e.provider, e.operation, coalesce(r.units, 1) as units, 0 as charged_tokens,
      e.credits as credits_consumed, coalesce(r.status, 'recorded') as status, e.created_at, 1 as calls
      from public.api_credit_entries e left join public.environment_api_requests r
        on r.user_id = e.user_id and r.request_id = e.request_id where e.user_id = v_user
    union all
    select provider, operation, units, 0, 0, status, created_at, 0
      from public.environment_api_requests where user_id = v_user and status = 'cached'
    union all
    -- Preserve historical token charges from before record-only accounting.
    select provider, 'route_aip'::text, 1, charged_tokens, 0, status, created_at, 1
      from public.route_api_call_logs where user_id = v_user and charged_tokens > 0
  ), month_events as (
    select * from events where created_at >= (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
  ), providers as (
    select provider, sum(calls) as calls, sum(charged_tokens) as tokens, sum(credits_consumed) as credits,
      sum(case when calls > 0 then units else 0 end) as samples,
      count(*) filter (where status = 'cached') as cache_hits
      from month_events group by provider
  ), totals as (
    select coalesce(sum(credits_consumed), 0) as credits from events
  ), policy as (
    select estimated_tokens_per_credit as rate from public.api_credit_policy where singleton
  )
  select jsonb_build_object('status', 'ok', 'settlement', 'deferred',
    'tokenBalance', coalesce((select token_balance from public.wallets where user_id = v_user), 0),
    'totalCredits', (select credits from totals),
    'estimatedTokensPerCredit', (select rate from policy),
    'estimatedFutureTokens', (select round(totals.credits * policy.rate, 6) from totals cross join policy),
    'today', (select jsonb_build_object('calls', coalesce(sum(calls), 0), 'credits', coalesce(sum(credits_consumed), 0), 'tokens', coalesce(sum(charged_tokens), 0))
      from events where created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')),
    'month', (select jsonb_build_object('calls', coalesce(sum(calls), 0), 'credits', coalesce(sum(credits_consumed), 0), 'tokens', coalesce(sum(charged_tokens), 0)) from month_events),
    'providers', coalesce((select jsonb_agg(to_jsonb(providers) order by provider) from providers), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(recent) order by created_at desc) from
      (select provider, operation, units, charged_tokens, credits_consumed, status, created_at from events order by created_at desc limit 30) recent), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.reserve_environment_api_call(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_environment_api_call(uuid, uuid, text, jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_environment_api_call(uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.complete_environment_api_call(uuid, uuid, text, jsonb, integer, integer) to service_role;
revoke all on function public.get_api_usage_summary() from public, anon;
grant execute on function public.get_api_usage_summary() to authenticated;
commit;
