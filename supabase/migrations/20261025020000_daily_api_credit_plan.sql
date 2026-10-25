-- A shared per-user ceiling across environment, route and AIP reservations.
-- Credits remain record-only; reaching the cap never debits tokens.
begin;
alter table public.api_credit_policy add column daily_credit_limit integer not null default 2000
  check(daily_credit_limit > 0);

create function public.enforce_daily_api_credit_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_used bigint;
  v_limit integer;
begin
  -- Both gateway families must acquire this same per-user transaction lock.
  perform pg_advisory_xact_lock(hashtextextended('api-credit-day:' || new.user_id::text, 0));
  select coalesce((select daily_credit_limit from public.api_credit_policy where singleton), 2000) into v_limit;
  select coalesce(sum(credits), 0) into v_used from public.api_credit_entries
    where user_id = new.user_id and created_at >= v_start and created_at < v_start + interval '24 hours';
  if v_used + new.credits > v_limit then
    raise exception using errcode = 'P2000', message = 'daily_credit_limit_reached';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_daily_api_credit_limit() from public, anon, authenticated;
create trigger enforce_daily_api_credit_limit before insert on public.api_credit_entries
  for each row execute function public.enforce_daily_api_credit_limit();

create function public.get_daily_api_credit_usage() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_used bigint;
  v_limit integer;
begin
  if v_user is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  select coalesce((select daily_credit_limit from public.api_credit_policy where singleton), 2000) into v_limit;
  select coalesce(sum(credits), 0) into v_used from public.api_credit_entries
    where user_id = v_user and created_at >= v_start and created_at < v_start + interval '24 hours';
  return jsonb_build_object('status', 'ok', 'dailyPlan', jsonb_build_object(
    'name', 'default', 'limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0),
    'percentUsed', round(v_used * 100.0 / v_limit, 2), 'resetsAt', v_start + interval '24 hours'));
end;
$$;
revoke all on function public.get_daily_api_credit_usage() from public, anon;
grant execute on function public.get_daily_api_credit_usage() to authenticated;

-- Wrap existing functions so a trigger rejection becomes a normal API status.
-- Their exception blocks roll back any earlier counter changes in that attempt.
alter function public.reserve_environment_api_call(uuid, uuid, text, text, text, integer)
  rename to reserve_environment_api_call_before_daily_plan;
revoke all on function public.reserve_environment_api_call_before_daily_plan(uuid, uuid, text, text, text, integer)
  from public, anon, authenticated, service_role;
create function public.reserve_environment_api_call(
  p_user_id uuid, p_request_id uuid, p_request_key text, p_provider text, p_operation text, p_units integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.reserve_environment_api_call_before_daily_plan(p_user_id, p_request_id, p_request_key, p_provider, p_operation, p_units);
exception when sqlstate 'P2000' then
  return jsonb_build_object('status', 'daily_limit_reached', 'retryAfterSeconds',
    greatest(1, ceil(extract(epoch from ((date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + interval '24 hours') - now()))),
    'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 0, 'settlement', 'deferred'));
end;
$$;
revoke all on function public.reserve_environment_api_call(uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_environment_api_call(uuid, uuid, text, text, text, integer) to service_role;

alter function public.reserve_route_api_call(uuid, integer, integer, text, text, text)
  rename to reserve_route_api_call_before_daily_plan;
revoke all on function public.reserve_route_api_call_before_daily_plan(uuid, integer, integer, text, text, text)
  from public, anon, authenticated, service_role;
create function public.reserve_route_api_call(
  p_user_id uuid, p_limit_per_minute integer, p_token_cost integer,
  p_provider text, p_origin text default null, p_destination text default null
) returns table(status text, charged_tokens integer, window_start timestamptz, call_count integer, token_balance integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query select * from public.reserve_route_api_call_before_daily_plan(
    p_user_id, p_limit_per_minute, p_token_cost, p_provider, p_origin, p_destination);
exception when sqlstate 'P2000' then
  return query select 'daily_limit_reached'::text, 0, date_trunc('minute', now()), 0,
    coalesce((select w.token_balance from public.wallets w where w.user_id = p_user_id), 0);
end;
$$;
revoke all on function public.reserve_route_api_call(uuid, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_route_api_call(uuid, integer, integer, text, text, text) to service_role;

alter function public.get_api_usage_summary() rename to get_api_usage_summary_before_daily_plan;
revoke all on function public.get_api_usage_summary_before_daily_plan() from public, anon, authenticated, service_role;
create function public.get_api_usage_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return public.get_api_usage_summary_before_daily_plan()
    || jsonb_build_object('dailyPlan', public.get_daily_api_credit_usage()->'dailyPlan');
end;
$$;
revoke all on function public.get_api_usage_summary() from public, anon;
grant execute on function public.get_api_usage_summary() to authenticated;
commit;
