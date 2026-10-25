-- Prospective deferred billing: first 50 daily calls free, then 0.2 tokens/call.
-- Every call remains recorded as a credit. No token wallet mutations.
begin;
alter table public.api_credit_policy add column daily_free_credits integer not null default 50 check(daily_free_credits >= 0);
update public.api_credit_policy set estimated_tokens_per_credit = 0.2, updated_at = now() where singleton;
alter table public.api_credit_entries
  add column free_credits integer not null default 0 check(free_credits >= 0),
  add column billable_credits integer not null default 0 check(billable_credits >= 0),
  add column recorded_token_rate numeric(12, 6) not null default 0 check(recorded_token_rate >= 0),
  add column recorded_tokens numeric(18, 6) not null default 0 check(recorded_tokens >= 0),
  add column pricing_version text not null default 'legacy-record-only';

create or replace function public.enforce_daily_api_credit_limit() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_used bigint;
  v_limit integer;
  v_free integer;
  v_rate numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('api-credit-day:' || new.user_id::text, 0));
  select coalesce((select daily_credit_limit from public.api_credit_policy where singleton), 2000),
    coalesce((select daily_free_credits from public.api_credit_policy where singleton), 50),
    coalesce((select estimated_tokens_per_credit from public.api_credit_policy where singleton), 0.2)
    into v_limit, v_free, v_rate;
  select coalesce(sum(credits), 0) into v_used from public.api_credit_entries
    where user_id = new.user_id and created_at >= v_start and created_at < v_start + interval '24 hours';
  if v_used + new.credits > v_limit then
    raise exception using errcode = 'P2000', message = 'daily_credit_limit_reached';
  end if;
  new.free_credits := least(new.credits, greatest(v_free - v_used, 0));
  new.billable_credits := new.credits - new.free_credits;
  new.recorded_token_rate := v_rate;
  new.recorded_tokens := round(new.billable_credits * v_rate, 6);
  new.pricing_version := 'daily-free-v1';
  return new;
end;
$$;

create or replace function public.get_daily_api_credit_usage() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_used bigint;
  v_billable bigint;
  v_recorded numeric;
  v_limit integer;
  v_free integer;
  v_rate numeric;
begin
  if v_user is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  select coalesce((select daily_credit_limit from public.api_credit_policy where singleton), 2000),
    coalesce((select daily_free_credits from public.api_credit_policy where singleton), 50),
    coalesce((select estimated_tokens_per_credit from public.api_credit_policy where singleton), 0.2)
    into v_limit, v_free, v_rate;
  select coalesce(sum(credits), 0), coalesce(sum(billable_credits), 0), coalesce(sum(recorded_tokens), 0)
    into v_used, v_billable, v_recorded from public.api_credit_entries
    where user_id = v_user and created_at >= v_start and created_at < v_start + interval '24 hours';
  return jsonb_build_object('status', 'ok', 'dailyPlan', jsonb_build_object(
    'name', 'default', 'limit', v_limit, 'used', v_used, 'remaining', greatest(v_limit - v_used, 0),
    'percentUsed', round(v_used * 100.0 / v_limit, 2), 'resetsAt', v_start + interval '24 hours',
    'freeLimit', v_free, 'freeRemaining', greatest(v_free - v_used, 0),
    'billableCredits', v_billable, 'tokensPerBillableCredit', v_rate, 'recordedTokenCharge', v_recorded));
end;
$$;

create or replace function public.get_api_usage_summary() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_summary jsonb;
  v_day timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_month timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_total numeric;
  v_today jsonb;
  v_monthly jsonb;
  v_recent jsonb;
  v_providers jsonb;
begin
  if v_user is null then return jsonb_build_object('status', 'unauthenticated'); end if;
  v_summary := public.get_api_usage_summary_before_daily_plan();
  select coalesce(sum(recorded_tokens), 0) into v_total from public.api_credit_entries where user_id = v_user;
  select jsonb_build_object('freeCredits', coalesce(sum(free_credits), 0), 'billableCredits', coalesce(sum(billable_credits), 0),
    'recordedTokenCharge', coalesce(sum(recorded_tokens), 0)) into v_today
    from public.api_credit_entries where user_id = v_user and created_at >= v_day;
  select jsonb_build_object('freeCredits', coalesce(sum(free_credits), 0), 'billableCredits', coalesce(sum(billable_credits), 0),
    'recordedTokenCharge', coalesce(sum(recorded_tokens), 0)) into v_monthly
    from public.api_credit_entries where user_id = v_user and created_at >= v_month;
  select coalesce(jsonb_agg(item || jsonb_build_object(
    'billableCredits', coalesce((select sum(e.billable_credits) from public.api_credit_entries e
      where e.user_id = v_user and e.provider = item->>'provider' and e.created_at >= v_month), 0),
    'recordedTokenCharge', coalesce((select sum(e.recorded_tokens) from public.api_credit_entries e
      where e.user_id = v_user and e.provider = item->>'provider' and e.created_at >= v_month), 0))), '[]'::jsonb)
    into v_providers from jsonb_array_elements(v_summary->'providers') item;
  with events as (
    select e.provider, e.operation, coalesce(r.units, 1) as units, 0 as charged_tokens,
      e.credits as credits_consumed, coalesce(r.status, 'recorded') as status, e.created_at,
      e.free_credits, e.billable_credits, e.recorded_tokens, e.recorded_token_rate, e.pricing_version
      from public.api_credit_entries e left join public.environment_api_requests r
        on r.user_id = e.user_id and r.request_id = e.request_id where e.user_id = v_user
    union all
    select provider, operation, units, 0, 0, status, created_at, 0, 0, 0, 0, 'cached'
      from public.environment_api_requests where user_id = v_user and status = 'cached'
    union all
    select provider, 'route_aip'::text, 1, charged_tokens, 0, status, created_at, 0, 0, 0, 0, 'historical-payment'
      from public.route_api_call_logs where user_id = v_user and charged_tokens > 0
  ) select coalesce(jsonb_agg(to_jsonb(recent) order by created_at desc), '[]'::jsonb)
    into v_recent from (select * from events order by created_at desc limit 30) recent;
  return v_summary || jsonb_build_object('dailyPlan', public.get_daily_api_credit_usage()->'dailyPlan',
    'estimatedFutureTokens', v_total, 'recordedTokensDue', v_total,
    'today', (v_summary->'today') || v_today, 'month', (v_summary->'month') || v_monthly,
    'providers', v_providers, 'recent', v_recent);
end;
$$;
commit;
