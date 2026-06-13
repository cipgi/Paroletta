-- Register internal development/no-subscription plans without making the
-- development plan a public default.

alter table app.subscription_plans
drop constraint if exists subscription_plans_image_limit_check;

alter table app.subscription_plans
add constraint subscription_plans_image_limit_check
check (image_limit >= 0);

alter table app.subscription_plans
drop constraint if exists subscription_plans_sheet_limit_check;

alter table app.subscription_plans
add constraint subscription_plans_sheet_limit_check
check (sheet_limit >= 0);

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
  (
    'sviluppo',
    'Sviluppo',
    'Accesso temporaneo per provare Paroletta durante lo sviluppo.',
    1000,
    1000,
    365,
    false,
    false
  ),
  (
    'nessun_abbonamento',
    'Nessun abbonamento',
    'Stato interno senza accesso e senza utilizzo disponibile.',
    0,
    0,
    365,
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

alter table app.profiles
alter column piano set default 'trial';

alter table app.subscriptions
alter column plan set default 'trial';

alter table app.subscriptions
alter column status set default 'trial';
