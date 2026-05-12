-- Keep app.subscriptions.seats_count as the source of truth for team seats.
-- app.profiles.seats remains only a denormalized fallback for legacy/no-subscription paths.

create or replace function app.apply_subscription_plan_defaults()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  plan_row app.subscription_plans%rowtype;
  now_ts timestamptz := now();
begin
  select * into plan_row
  from app.subscription_plans
  where code = new.plan
    and active = true
  limit 1;

  if plan_row.code is null then
    raise exception 'invalid_or_inactive_plan: %', new.plan using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' or new.plan is distinct from old.plan then
    new.status := case when plan_row.is_trial then 'trial' else 'attivo' end;

    if new.seats_count is null then
      if tg_op = 'UPDATE' then
        new.seats_count := old.seats_count;
      else
        new.seats_count := 1;
      end if;
    end if;

    new.current_period_start := coalesce(new.current_period_start, now_ts);
    new.current_period_end := new.current_period_start + make_interval(days => plan_row.duration_days);
    new.cancel_at_period_end := false;
  end if;

  return new;
end;
$$;

create or replace function app.sync_profile_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  update app.profiles
  set
    piano = new.plan,
    seats = new.seats_count,
    updated_at = now()
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_sync_profile on app.subscriptions;
create trigger trg_subscriptions_sync_profile
after insert or update of plan, seats_count on app.subscriptions
for each row
execute function app.sync_profile_from_subscription();

update app.profiles p
set
  piano = s.plan,
  seats = s.seats_count,
  updated_at = now()
from app.subscriptions s
where p.id = s.user_id
  and (
    p.piano is distinct from s.plan
    or p.seats is distinct from s.seats_count
  );
