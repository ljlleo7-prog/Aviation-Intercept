-- Cloud AIP fallback: one wallet credit per request; shared 10/minute quota.
-- Data remains in Supabase. Downloaded browser bundles never call these RPCs.
begin;

-- Qualify wallet/limit columns to avoid conflicts with RETURNS TABLE fields.
create or replace function public.reserve_route_api_call(
  p_user_id uuid,
  p_limit_per_minute integer,
  p_token_cost integer,
  p_provider text,
  p_origin text default null,
  p_destination text default null
)
returns table (
  status text,
  charged_tokens integer,
  window_start timestamptz,
  call_count integer,
  token_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := date_trunc('minute', now());
  v_call_count integer;
  v_wallet record;
begin
  if p_user_id is null or p_token_cost is null or p_token_cost < 1
    or p_limit_per_minute is null or p_limit_per_minute < 1 then
    raise exception 'Invalid credit reservation parameters';
  end if;
  insert into public.route_api_call_limits (user_id, window_start, call_count)
  values (p_user_id, v_window_start, 1)
  on conflict on constraint route_api_call_limits_pkey
  do update set call_count = public.route_api_call_limits.call_count + 1
  returning public.route_api_call_limits.call_count into v_call_count;

  if v_call_count > p_limit_per_minute then
    update public.route_api_call_limits as limits
      set call_count = greatest(limits.call_count - 1, 0)
      where limits.user_id = p_user_id and limits.window_start = v_window_start;

    return query
      select 'rate_limited'::text, 0, v_window_start, greatest(v_call_count - 1, 0), null::integer;
    return;
  end if;

  select w.id, w.token_balance
    into v_wallet
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  if not found or coalesce(v_wallet.token_balance, 0) < p_token_cost then
    update public.route_api_call_limits as limits
      set call_count = greatest(limits.call_count - 1, 0)
      where limits.user_id = p_user_id and limits.window_start = v_window_start;

    return query
      select 'insufficient_tokens'::text, 0, v_window_start, greatest(v_call_count - 1, 0), coalesce(v_wallet.token_balance, 0);
    return;
  end if;

  update public.wallets as w
    set token_balance = w.token_balance - p_token_cost
    where w.id = v_wallet.id;

  insert into public.ledger_entries (
    user_id,
    amount,
    currency,
    operation_type,
    description
  ) values (
    p_user_id,
    -p_token_cost,
    'TOKEN',
    'ROUTE_API_CALL',
    concat(coalesce(p_provider, 'Route provider'), ' route lookup ', coalesce(p_origin, ''), '-', coalesce(p_destination, ''))
  );

  return query
    select 'ok'::text, p_token_cost, v_window_start, v_call_count, (v_wallet.token_balance - p_token_cost);
end;
$$;

create schema if not exists aip_private;
revoke all on schema aip_private from public, anon, authenticated;

-- The reservation helper accepts a user ID and costs: only trusted server code
-- may call it. Public wrappers below derive identity and price server-side.
revoke all on function public.reserve_route_api_call(uuid, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_route_api_call(uuid, integer, integer, text, text, text) to service_role;

-- Keep the implementation inaccessible through PostgREST, including direct calls.
alter function public.skylinetragedy_search_airports(text, integer, boolean) set schema aip_private;
revoke all on function aip_private.skylinetragedy_search_airports(text, integer, boolean) from public, anon, authenticated;
create function public.skylinetragedy_search_airports(
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
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 1);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 1, 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;
revoke all on function public.skylinetragedy_search_airports(text, integer, boolean) from public, anon;
grant execute on function public.skylinetragedy_search_airports(text, integer, boolean) to authenticated;

-- Keep the implementation inaccessible through PostgREST, including direct calls.
alter function public.skylinetragedy_airports_within_radius(numeric, numeric, numeric, integer) set schema aip_private;
revoke all on function aip_private.skylinetragedy_airports_within_radius(numeric, numeric, numeric, integer) from public, anon, authenticated;
create function public.skylinetragedy_airports_within_radius(
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
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 1);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 1, 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;
revoke all on function public.skylinetragedy_airports_within_radius(numeric, numeric, numeric, integer) from public, anon;
grant execute on function public.skylinetragedy_airports_within_radius(numeric, numeric, numeric, integer) to authenticated;

-- Keep the implementation inaccessible through PostgREST, including direct calls.
alter function public.skylinetragedy_airport_details(text) set schema aip_private;
revoke all on function aip_private.skylinetragedy_airport_details(text) from public, anon, authenticated;
create function public.skylinetragedy_airport_details(
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
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 1);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 1, 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;
revoke all on function public.skylinetragedy_airport_details(text) from public, anon;
grant execute on function public.skylinetragedy_airport_details(text) to authenticated;

-- Keep the implementation inaccessible through PostgREST, including direct calls.
alter function public.skylinetragedy_nearest_navaids(numeric, numeric, numeric, integer) set schema aip_private;
revoke all on function aip_private.skylinetragedy_nearest_navaids(numeric, numeric, numeric, integer) from public, anon, authenticated;
create function public.skylinetragedy_nearest_navaids(
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
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 1);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 1, 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;
revoke all on function public.skylinetragedy_nearest_navaids(numeric, numeric, numeric, integer) from public, anon;
grant execute on function public.skylinetragedy_nearest_navaids(numeric, numeric, numeric, integer) to authenticated;

-- Keep the implementation inaccessible through PostgREST, including direct calls.
alter function public.skylinetragedy_nearest_suitable_airports(numeric, numeric, text, numeric, numeric, integer) set schema aip_private;
revoke all on function aip_private.skylinetragedy_nearest_suitable_airports(numeric, numeric, text, numeric, numeric, integer) from public, anon, authenticated;
create function public.skylinetragedy_nearest_suitable_airports(
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
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 1);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 1, 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;
revoke all on function public.skylinetragedy_nearest_suitable_airports(numeric, numeric, text, numeric, numeric, integer) from public, anon;
grant execute on function public.skylinetragedy_nearest_suitable_airports(numeric, numeric, text, numeric, numeric, integer) to authenticated;

-- Keep the implementation inaccessible through PostgREST, including direct calls.
alter function public.skylinetragedy_search_aip_route(text, text, text, text, integer) set schema aip_private;
revoke all on function aip_private.skylinetragedy_search_aip_route(text, text, text, text, integer) from public, anon, authenticated;
create function public.skylinetragedy_search_aip_route(
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
    values (v_user, 'supabase_aip', coalesce(v_response->>'status', 'unavailable'), 1);
  return coalesce(v_response, '{}'::jsonb) || jsonb_build_object('billing', jsonb_build_object(
    'chargedTokens', 1, 'tokenBalance', v_reservation.token_balance,
    'limitPerMinute', 10, 'callCount', v_reservation.call_count));
end;
$$;
revoke all on function public.skylinetragedy_search_aip_route(text, text, text, text, integer) from public, anon;
grant execute on function public.skylinetragedy_search_aip_route(text, text, text, text, integer) to authenticated;

-- Prevent bypassing the metered functions with direct REST table reads.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'skylinetragedy_aip_%'
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t.tablename);
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end;
$$;
commit;
