-- Add separate image quotas to subscription plans and user usage counters.

alter table app.subscription_plans
add column if not exists image_limit integer;

update app.subscription_plans
set image_limit = coalesce(image_limit, sheet_limit);

alter table app.subscription_plans
alter column image_limit set not null;

alter table app.subscription_plans
drop constraint if exists subscription_plans_image_limit_check;

alter table app.subscription_plans
add constraint subscription_plans_image_limit_check
check (image_limit > 0);

alter table app.profiles
add column if not exists trial_immagini_usate integer not null default 0
  check (trial_immagini_usate >= 0),
add column if not exists immagini_mese integer not null default 0
  check (immagini_mese >= 0);

insert into app.subscription_plans (
  code,
  name,
  description,
  sheet_limit,
  image_limit,
  duration_days,
  is_trial,
  active
)
values
  ('trial', 'Trial', 'Piano di prova', 15, 15, 15, true, true),
  (
    'starter',
    'Starter',
    'Per iniziare a provare Paroletta con un utilizzo leggero.',
    25,
    25,
    30,
    false,
    true
  ),
  (
    'pro',
    'Pro',
    'Per il professionista che usa Paroletta nella pratica quotidiana.',
    100,
    100,
    30,
    false,
    true
  ),
  (
    'max',
    'Max',
    'Per utilizzi intensivi con più generazioni di immagini.',
    100,
    300,
    30,
    false,
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sheet_limit = excluded.sheet_limit,
  image_limit = excluded.image_limit,
  duration_days = excluded.duration_days,
  is_trial = excluded.is_trial,
  active = excluded.active,
  updated_at = now();

update app.profiles
set piano = 'pro'
where piano = 'base';

update app.subscriptions
set plan = 'pro'
where plan = 'base';

update app.profiles
set piano = 'max'
where piano = 'dev';

update app.subscriptions
set plan = 'max'
where plan = 'dev';

update app.subscription_plans
set active = false,
    updated_at = now()
where code = 'base';

delete from app.subscription_plans
where code = 'dev';

create or replace function app.consume_image_usage(target_user_id uuid, image_count integer default 1)
returns table(used integer, image_limit integer)
language plpgsql
security definer
set search_path = app, public
as $$
declare
  pool_owner_id uuid;
  user_plan text;
  counter_column text;
  plan_limit integer;
  incremented integer;
  safe_count integer;
begin
  safe_count := greatest(coalesce(image_count, 1), 1);
  pool_owner_id := app.get_usage_pool_owner(target_user_id);

  select p.piano into user_plan
  from app.profiles p
  where p.id = pool_owner_id
  for update;

  if user_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  counter_column := case
    when user_plan = 'trial' then 'trial_immagini_usate'
    else 'immagini_mese'
  end;

  select sp.image_limit into plan_limit
  from app.subscription_plans sp
  where sp.code = user_plan and sp.active = true
  limit 1;

  if plan_limit is null then
    plan_limit := 5;
  end if;

  execute format(
    'update app.profiles set %I = %I + $2 where id = $1 and %I <= $3 - $2 returning %I',
    counter_column,
    counter_column,
    counter_column,
    counter_column
  )
  into incremented
  using pool_owner_id, safe_count, plan_limit;

  if incremented is null then
    raise exception 'image_limit_reached' using errcode = 'P0001';
  end if;

  used := incremented;
  image_limit := plan_limit;
  return next;
end;
$$;

create or replace function app.release_image_usage(target_user_id uuid, image_count integer default 1)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  pool_owner_id uuid;
  user_plan text;
  counter_column text;
  safe_count integer;
begin
  safe_count := greatest(coalesce(image_count, 1), 1);
  pool_owner_id := app.get_usage_pool_owner(target_user_id);

  select p.piano into user_plan
  from app.profiles p
  where p.id = pool_owner_id
  for update;

  if user_plan is null then
    return;
  end if;

  counter_column := case
    when user_plan = 'trial' then 'trial_immagini_usate'
    else 'immagini_mese'
  end;

  execute format(
    'update app.profiles set %I = greatest(%I - $2, 0) where id = $1',
    counter_column,
    counter_column
  )
  using pool_owner_id, safe_count;
end;
$$;
