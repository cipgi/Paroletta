-- Temporarily give every account development access while Paroletta is not in production.

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
    true
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
alter column piano set default 'sviluppo';

alter table app.subscriptions
alter column plan set default 'sviluppo';

alter table app.subscriptions
alter column status set default 'attivo';

update app.profiles
set piano = 'sviluppo'
where piano <> 'sviluppo';

insert into app.subscriptions (
  user_id,
  status,
  plan,
  seats_count,
  current_period_start,
  current_period_end,
  cancel_at_period_end
)
select
  p.id,
  'attivo',
  'sviluppo',
  coalesce(p.seats, 1),
  now(),
  null,
  false
from app.profiles p
on conflict (user_id) do update
set
  status = 'attivo',
  plan = 'sviluppo',
  seats_count = greatest(coalesce(app.subscriptions.seats_count, excluded.seats_count), 1),
  current_period_start = now(),
  current_period_end = null,
  cancel_at_period_end = false,
  updated_at = now();
