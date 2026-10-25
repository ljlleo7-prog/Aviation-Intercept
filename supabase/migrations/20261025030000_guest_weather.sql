-- Public coarse weather only. Guests cannot reserve terrain/route credits.
-- The guest pool uses at most 800 of the provider's 8,000 default daily calls.
begin;
create table public.guest_weather_cache (
  request_key text primary key,
  guest_key text not null,
  request_id uuid not null,
  status text not null check(status in ('pending', 'ok')),
  data jsonb,
  expires_at timestamptz not null
);
alter table public.guest_weather_cache enable row level security;
revoke all on public.guest_weather_cache from public, anon, authenticated;
grant all on public.guest_weather_cache to service_role;

create function public.reserve_guest_weather_api_call(p_guest_key text, p_request_id uuid, p_request_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_cache public.guest_weather_cache%rowtype;
  v_budget public.environment_api_budgets%rowtype;
  v_start timestamptz;
  v_bucket text;
  v_global bigint;
  v_guest_pool bigint;
  v_guest bigint;
  v_limit integer;
begin
  if p_guest_key is null or p_guest_key !~ '^[a-f0-9]{64}$' or p_request_key is null
    or p_request_key !~ '^[a-f0-9]{64}$' or p_request_id is null then raise exception 'Invalid guest weather reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended('environment_api_reservation', 0));
  select * into v_cache from public.guest_weather_cache where request_key = p_request_key;
  if found and v_cache.expires_at > now() then
    return case when v_cache.status = 'ok' then jsonb_build_object('status', 'ok', 'data', v_cache.data, 'cached', true, 'guest', true,
        'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 0))
      else jsonb_build_object('status', 'pending', 'retryAfterSeconds', 2) end;
  end if;
  select * into v_budget from public.environment_api_budgets where provider = 'open_meteo';
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  if v_budget.cooldown_until > now() then
    return jsonb_build_object('status', 'provider_rate_limited', 'retryAfterSeconds', ceil(extract(epoch from v_budget.cooldown_until - now())));
  end if;
  foreach v_bucket in array array['minute', 'day', 'month'] loop
    v_start := date_trunc(v_bucket, now() at time zone 'UTC') at time zone 'UTC';
    select coalesce(sum(units), 0) into v_global from public.environment_api_counters
      where scope = 'global' and provider = 'open_meteo' and bucket = v_bucket and window_start = v_start;
    select coalesce(sum(units), 0) into v_guest_pool from public.environment_api_counters
      where scope = 'guest-pool' and provider = 'open_meteo' and bucket = v_bucket and window_start = v_start;
    select coalesce(sum(units), 0) into v_guest from public.environment_api_counters
      where scope = 'guest:' || p_guest_key and provider = 'open_meteo' and bucket = v_bucket and window_start = v_start;
    v_limit := case v_bucket when 'minute' then v_budget.global_minute_units
      when 'day' then v_budget.global_day_units else v_budget.global_month_units end;
    if v_global + 1 > v_limit or (v_bucket = 'minute' and v_guest_pool >= 10)
      or (v_bucket = 'day' and v_guest_pool >= 800) then
      return jsonb_build_object('status', 'budget_exhausted', 'retryAfterSeconds', 300);
    end if;
    if (v_bucket = 'minute' and v_guest >= 1) or (v_bucket = 'day' and v_guest >= 120) then
      return jsonb_build_object('status', 'user_limit_reached', 'retryAfterSeconds', 60);
    end if;
  end loop;
  foreach v_bucket in array array['minute', 'day', 'month'] loop
    v_start := date_trunc(v_bucket, now() at time zone 'UTC') at time zone 'UTC';
    insert into public.environment_api_counters(scope, provider, bucket, window_start, units, calls)
      values('global', 'open_meteo', v_bucket, v_start, 1, 1),
        ('guest-pool', 'open_meteo', v_bucket, v_start, 1, 1),
        ('guest:' || p_guest_key, 'open_meteo', v_bucket, v_start, 1, 1)
      on conflict(scope, provider, bucket, window_start) do update
        set units = environment_api_counters.units + 1, calls = environment_api_counters.calls + 1;
  end loop;
  insert into public.guest_weather_cache(request_key, guest_key, request_id, status, expires_at)
    values(p_request_key, p_guest_key, p_request_id, 'pending', now() + interval '60 seconds')
    on conflict(request_key) do update set guest_key = excluded.guest_key, request_id = excluded.request_id,
      status = 'pending', data = null, expires_at = excluded.expires_at;
  return jsonb_build_object('status', 'reserved', 'guest', true, 'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 0));
end;
$$;

create function public.complete_guest_weather_api_call(p_guest_key text, p_request_id uuid, p_request_key text,
  p_status text, p_data jsonb, p_retry_after_seconds integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_status is null or p_status not in ('ok', 'provider_failed', 'provider_rate_limited') then raise exception 'Invalid completion status'; end if;
  perform pg_advisory_xact_lock(hashtextextended('environment_api_reservation', 0));
  if not exists(select 1 from public.guest_weather_cache where request_key = p_request_key
    and guest_key = p_guest_key and request_id = p_request_id and status = 'pending') then raise exception 'Missing guest reservation'; end if;
  if p_status = 'ok' then
    update public.guest_weather_cache set status = 'ok', data = p_data, expires_at = now() + interval '5 minutes'
      where request_key = p_request_key;
  else
    delete from public.guest_weather_cache where request_key = p_request_key;
    update public.environment_api_budgets set cooldown_until = greatest(coalesce(cooldown_until, now()),
      now() + make_interval(secs => greatest(30, least(coalesce(p_retry_after_seconds, 30), 2678400)))) where provider = 'open_meteo';
  end if;
  return jsonb_build_object('status', p_status, 'data', case when p_status = 'ok' then p_data else null end,
    'guest', true, 'retryAfterSeconds', coalesce(p_retry_after_seconds, 60), 'billing', jsonb_build_object('chargedTokens', 0, 'creditsConsumed', 0));
end;
$$;
revoke all on function public.reserve_guest_weather_api_call(text, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_guest_weather_api_call(text, uuid, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.reserve_guest_weather_api_call(text, uuid, text) to service_role;
grant execute on function public.complete_guest_weather_api_call(text, uuid, text, text, jsonb, integer) to service_role;
commit;
