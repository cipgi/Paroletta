-- Ensure every auth user always has a matching app profile.
create or replace function app.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = app, auth, public
as $$
declare
  resolved_email text;
  resolved_name text;
begin
  resolved_email := coalesce(new.email, '');
  resolved_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Utente'
  );

  insert into app.profiles (id, email, name)
  values (new.id, resolved_email, resolved_name)
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(app.profiles.name, ''), excluded.name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_auth_user_created_profile on auth.users;
create trigger trg_auth_user_created_profile
after insert on auth.users
for each row execute function app.handle_auth_user_created();
