-- Explicit team-manager flag so team ownership can be controlled from SQL.
alter table app.profiles
add column if not exists is_team_manager boolean not null default false;

-- Preserve existing teams and multi-seat owners when the flag is introduced.
update app.profiles p
set is_team_manager = true
where p.is_team_manager = false
  and (
    exists (
      select 1
      from app.seat_assignments sa
      where sa.owner_user_id = p.id
    )
    or coalesce(p.seats, 1) > 1
    or exists (
      select 1
      from app.subscriptions s
      where s.user_id = p.id
        and coalesce(s.seats_count, 1) > 1
    )
  );

-- Users may update their profile, but this admin-only flag must not be
-- self-editable through authenticated PostgREST requests.
create or replace function app.prevent_team_manager_self_update()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if old.is_team_manager is distinct from new.is_team_manager
     and jwt_role not in ('', 'service_role') then
    raise exception 'team_manager_flag_admin_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_team_manager_admin_only on app.profiles;
create trigger trg_profiles_team_manager_admin_only
before update of is_team_manager on app.profiles
for each row execute function app.prevent_team_manager_self_update();
