-- Store profile names only as plain text so user-controlled names cannot persist HTML/script payloads.
create or replace function app.sanitize_profile_name(input text, fallback text default 'Utente')
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      left(
        trim(
          regexp_replace(
            regexp_replace(
              regexp_replace(coalesce(input, ''), '<[^>]*>', '', 'g'),
              '[<>]',
              '',
              'g'
            ),
            '[[:cntrl:]]+',
            '',
            'g'
          )
        ),
        255
      ),
      ''
    ),
    nullif(left(trim(coalesce(fallback, '')), 255), ''),
    'Utente'
  );
$$;

create or replace function app.sanitize_profile_names_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name := app.sanitize_profile_name(new.name, split_part(coalesce(new.email, ''), '@', 1));
  new.first_name := nullif(app.sanitize_profile_name(new.first_name, ''), 'Utente');
  new.last_name := nullif(app.sanitize_profile_name(new.last_name, ''), 'Utente');
  return new;
end;
$$;

drop trigger if exists trg_profiles_sanitize_names on app.profiles;
create trigger trg_profiles_sanitize_names
before insert or update of name, first_name, last_name, email on app.profiles
for each row execute function app.sanitize_profile_names_before_write();

update app.profiles
set
  name = app.sanitize_profile_name(name, split_part(coalesce(email, ''), '@', 1)),
  first_name = nullif(app.sanitize_profile_name(first_name, ''), 'Utente'),
  last_name = nullif(app.sanitize_profile_name(last_name, ''), 'Utente')
where name ~ '[<>]' or first_name ~ '[<>]' or last_name ~ '[<>]';

alter table app.profiles
  drop constraint if exists profiles_name_plain_text,
  add constraint profiles_name_plain_text
  check (name !~ '[<>]' and coalesce(first_name, '') !~ '[<>]' and coalesce(last_name, '') !~ '[<>]');

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
  resolved_name := app.sanitize_profile_name(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Utente'
    ),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
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
