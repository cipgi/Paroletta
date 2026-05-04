-- Enforce sheet limits at DB level and increment usage counters atomically.
create or replace function app.enforce_and_count_sheet_usage()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  user_plan text;
  counter_column text;
  plan_limit integer;
  incremented integer;
begin
  select p.piano into user_plan
  from app.profiles p
  where p.id = new.user_id
  for update;

  if user_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  counter_column := case when user_plan = 'trial' then 'trial_schede_usate' else 'schede_mese' end;

  select sp.sheet_limit into plan_limit
  from app.subscription_plans sp
  where sp.code = user_plan and sp.active = true
  limit 1;

  if plan_limit is null then
    plan_limit := 5;
  end if;

  execute format(
    'update app.profiles set %I = %I + 1 where id = $1 and %I < $2 returning %I',
    counter_column,
    counter_column,
    counter_column,
    counter_column
  )
  into incremented
  using new.user_id, plan_limit;

  if incremented is null then
    raise exception 'sheet_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sheets_enforce_usage on app.sheets;
create trigger trg_sheets_enforce_usage
before insert on app.sheets
for each row
execute function app.enforce_and_count_sheet_usage();
