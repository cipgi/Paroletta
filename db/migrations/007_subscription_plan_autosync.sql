-- Automatically align subscription fields when plan changes.
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
    new.seats_count := 1;
    new.current_period_start := coalesce(new.current_period_start, now_ts);
    new.current_period_end := new.current_period_start + make_interval(days => plan_row.duration_days);
    new.cancel_at_period_end := false;

    update app.profiles
    set
      piano = plan_row.code,
      seats = 1,
      updated_at = now_ts
    where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_apply_plan_defaults on app.subscriptions;
create trigger trg_subscriptions_apply_plan_defaults
before insert or update of plan on app.subscriptions
for each row
execute function app.apply_subscription_plan_defaults();
