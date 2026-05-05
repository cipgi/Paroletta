-- Add internal dev subscription plan (SQL-editor only).
insert into app.subscription_plans (code, name, description, sheet_limit, duration_days, is_trial, active)
values ('dev', 'Dev', 'Piano interno per sviluppo', 1000, 1, false, true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  sheet_limit = excluded.sheet_limit,
  duration_days = excluded.duration_days,
  is_trial = excluded.is_trial,
  active = excluded.active,
  updated_at = now();
