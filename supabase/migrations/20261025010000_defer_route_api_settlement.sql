-- Keep existing AIP/route RPC contracts, but accrue one API credit per call.
-- This replaces the earlier immediate token debit. Historical ledger stays intact.
begin;
revoke insert, update, delete on public.route_api_call_limits from public, anon, authenticated;

create table public.route_api_credit_budgets (
  provider text primary key,
  global_minute_calls integer not null check(global_minute_calls > 0),
  global_day_calls integer not null check(global_day_calls > 0),
  user_day_calls integer not null check(user_day_calls > 0)
);
insert into public.route_api_credit_budgets values
  ('SimBrief', 30, 1000, 100), ('FlightPlanDB', 30, 1000, 100),
  ('OpenAIP', 30, 1000, 100), ('ProcedureData', 30, 1000, 100),
  ('AirportReference', 30, 1000, 100), ('OurAirports', 30, 1000, 100),
  ('FAACIFP', 30, 1000, 100), ('supabase_aip', 120, 10000, 500);
create index api_credit_entries_provider_usage_idx on public.api_credit_entries(provider, created_at desc);
alter table public.route_api_credit_budgets enable row level security;
revoke all on public.route_api_credit_budgets from public, anon, authenticated;
grant all on public.route_api_credit_budgets to service_role;

create or replace function public.reserve_route_api_call(
  p_user_id uuid, p_limit_per_minute integer, p_token_cost integer,
  p_provider text, p_origin text default null, p_destination text default null
) returns table(status text, charged_tokens integer, window_start timestamptz, call_count integer, token_balance integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := date_trunc('minute', now());
  v_calls integer;
  v_balance integer;
  v_budget public.route_api_credit_budgets%rowtype;
  v_global_minute integer;
  v_global_day integer;
  v_user_day integer;
begin
  if p_user_id is null or p_limit_per_minute is null or p_limit_per_minute < 1 or p_token_cost is distinct from 1 then
    raise exception 'Invalid API credit reservation';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('route_api_credit_reservation', 0));
  select * into v_budget from public.route_api_credit_budgets where provider = p_provider;
  if not found then
    return query select 'unavailable'::text, 0, v_start, 0, 0;
    return;
  end if;
  select count(*) filter(where created_at >= v_start), count(*), count(*) filter(where user_id = p_user_id)
    into v_global_minute, v_global_day, v_user_day from public.api_credit_entries
    where provider = p_provider and created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  if v_global_minute >= v_budget.global_minute_calls or v_global_day >= v_budget.global_day_calls
    or v_user_day >= v_budget.user_day_calls then
    return query select 'rate_limited'::text, 0, v_start, 0, 0;
    return;
  end if;
  insert into public.route_api_call_limits(user_id, window_start, call_count)
    values(p_user_id, v_start, 1)
    on conflict on constraint route_api_call_limits_pkey do update
      set call_count = route_api_call_limits.call_count + 1
    returning route_api_call_limits.call_count into v_calls;
  select w.token_balance into v_balance from public.wallets w where w.user_id = p_user_id;
  if v_calls > least(p_limit_per_minute, 10) then
    update public.route_api_call_limits as limits set call_count = limits.call_count - 1
      where limits.user_id = p_user_id and limits.window_start = v_start;
    return query select 'rate_limited'::text, 0, v_start, v_calls - 1, coalesce(v_balance, 0);
    return;
  end if;
  insert into public.api_credit_entries(user_id, request_id, provider, operation, credits)
    values(p_user_id, gen_random_uuid(), coalesce(p_provider, 'route'), 'route_aip', 1);
  return query select 'ok'::text, 0, v_start, v_calls, coalesce(v_balance, 0);
end;
$$;
revoke all on function public.reserve_route_api_call(uuid, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_route_api_call(uuid, integer, integer, text, text, text) to service_role;

create or replace function public.skylinetragedy_search_airports(
  p_query text,
  p_limit integer default 20,
  p_include_emergency boolean default true
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reservation record;
  v_response jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  if length(trim(coalesce(p_query, ''))) < 2 or length(p_query) > 100 then
    return jsonb_build_object('status', 'unavailable', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  select * into v_reservation from public.reserve_route_api_call(v_user, 10, 1, 'supabase_aip', null, null);
  if v_reservation.status <> 'ok' then
    return jsonb_build_object('status', v_reservation.status, 'billing', jsonb_build_object(
      'chargedTokens', 0, 'tokenBalance', v_reservation.token_balance,
      'limitPerMinute', 10, 'callCount', v_reservation.call_count));
  end if;
  v_response := aip_private.skylinetragedy_search_airports(p_query, p_limit, p_include_emergency);
  insert into public.route_api_call_logs(user_id, provider, status, charged_tokens)
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 0);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred', 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;

create or replace function public.skylinetragedy_airports_within_radius(
  p_latitude numeric,
  p_longitude numeric,
  p_radius_nm numeric default 100,
  p_limit integer default 50
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reservation record;
  v_response jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  select * into v_reservation from public.reserve_route_api_call(v_user, 10, 1, 'supabase_aip', null, null);
  if v_reservation.status <> 'ok' then
    return jsonb_build_object('status', v_reservation.status, 'billing', jsonb_build_object(
      'chargedTokens', 0, 'tokenBalance', v_reservation.token_balance,
      'limitPerMinute', 10, 'callCount', v_reservation.call_count));
  end if;
  v_response := aip_private.skylinetragedy_airports_within_radius(p_latitude, p_longitude, p_radius_nm, p_limit);
  insert into public.route_api_call_logs(user_id, provider, status, charged_tokens)
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 0);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred', 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;

create or replace function public.skylinetragedy_airport_details(
  p_airport_code text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reservation record;
  v_response jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  select * into v_reservation from public.reserve_route_api_call(v_user, 10, 1, 'supabase_aip', null, null);
  if v_reservation.status <> 'ok' then
    return jsonb_build_object('status', v_reservation.status, 'billing', jsonb_build_object(
      'chargedTokens', 0, 'tokenBalance', v_reservation.token_balance,
      'limitPerMinute', 10, 'callCount', v_reservation.call_count));
  end if;
  v_response := aip_private.skylinetragedy_airport_details(p_airport_code);
  insert into public.route_api_call_logs(user_id, provider, status, charged_tokens)
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 0);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred', 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;

create or replace function public.skylinetragedy_nearest_navaids(
  p_latitude numeric,
  p_longitude numeric,
  p_radius_nm numeric default 150,
  p_limit integer default 10
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reservation record;
  v_response jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  select * into v_reservation from public.reserve_route_api_call(v_user, 10, 1, 'supabase_aip', null, null);
  if v_reservation.status <> 'ok' then
    return jsonb_build_object('status', v_reservation.status, 'billing', jsonb_build_object(
      'chargedTokens', 0, 'tokenBalance', v_reservation.token_balance,
      'limitPerMinute', 10, 'callCount', v_reservation.call_count));
  end if;
  v_response := aip_private.skylinetragedy_nearest_navaids(p_latitude, p_longitude, p_radius_nm, p_limit);
  insert into public.route_api_call_logs(user_id, provider, status, charged_tokens)
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 0);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred', 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;

create or replace function public.skylinetragedy_nearest_suitable_airports(
  p_latitude numeric,
  p_longitude numeric,
  p_aircraft_category text default null,
  p_min_runway_length_ft numeric default 0,
  p_radius_nm numeric default 150,
  p_limit integer default 10
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reservation record;
  v_response jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  select * into v_reservation from public.reserve_route_api_call(v_user, 10, 1, 'supabase_aip', null, null);
  if v_reservation.status <> 'ok' then
    return jsonb_build_object('status', v_reservation.status, 'billing', jsonb_build_object(
      'chargedTokens', 0, 'tokenBalance', v_reservation.token_balance,
      'limitPerMinute', 10, 'callCount', v_reservation.call_count));
  end if;
  v_response := aip_private.skylinetragedy_nearest_suitable_airports(p_latitude, p_longitude, p_aircraft_category, p_min_runway_length_ft, p_radius_nm, p_limit);
  insert into public.route_api_call_logs(user_id, provider, status, charged_tokens)
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 0);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred', 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;

create or replace function public.skylinetragedy_search_aip_route(
  p_departure_code text,
  p_arrival_code text,
  p_region_code text default '*',
  p_aip_cycle text default '2605',
  p_limit integer default 1
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reservation record;
  v_response jsonb;
begin
  if v_user is null then
    return jsonb_build_object('status', 'unauthenticated', 'billing', jsonb_build_object('chargedTokens', 0));
  end if;
  p_limit := greatest(1, least(coalesce(p_limit, 1), 5));
  select * into v_reservation from public.reserve_route_api_call(v_user, 10, 1, 'supabase_aip', null, null);
  if v_reservation.status <> 'ok' then
    return jsonb_build_object('status', v_reservation.status, 'billing', jsonb_build_object(
      'chargedTokens', 0, 'tokenBalance', v_reservation.token_balance,
      'limitPerMinute', 10, 'callCount', v_reservation.call_count));
  end if;
  v_response := aip_private.skylinetragedy_search_aip_route(p_departure_code, p_arrival_code, p_region_code, p_aip_cycle, p_limit);
  insert into public.route_api_call_logs(user_id, provider, status, charged_tokens)
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 0);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 0, 'creditsConsumed', 1, 'settlement', 'deferred', 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;

commit;
