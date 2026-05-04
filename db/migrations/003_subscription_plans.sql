-- Dynamic subscription plans in app schema
create table if not exists app.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  sheet_limit integer not null check (sheet_limit > 0),
  duration_days integer not null check (duration_days > 0),
  is_trial boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app.subscription_plans (code, name, description, sheet_limit, duration_days, is_trial, active)
values
  ('trial', 'Trial', 'Piano di prova', 15, 15, true, true),
  ('base', 'Base', 'Piano mensile', 100, 30, false, true)
on conflict (code) do nothing;

drop trigger if exists trg_subscription_plans_updated_at on app.subscription_plans;
create trigger trg_subscription_plans_updated_at before update on app.subscription_plans
for each row execute function app.set_updated_at();

alter table app.subscription_plans enable row level security;

drop policy if exists "subscription plans readable by authenticated" on app.subscription_plans;
create policy "subscription plans readable by authenticated" on app.subscription_plans
for select using (auth.role() = 'authenticated');
