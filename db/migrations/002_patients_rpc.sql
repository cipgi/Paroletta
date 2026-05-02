-- Patients RPC helpers in public schema to avoid PostgREST custom-schema exposure issues.

create or replace function public.app_patients_list(p_user_id uuid)
returns table (
  id uuid,
  user_id uuid,
  alias_eta text,
  note_anonime text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select p.id, p.user_id, p.alias_eta, p.note_anonime, p.created_at
  from app.patients p
  where p.user_id = p_user_id
  order by p.created_at desc;
$$;

create or replace function public.app_patients_create(
  p_user_id uuid,
  p_alias_eta text,
  p_note_anonime text default null
)
returns table (
  id uuid,
  user_id uuid,
  alias_eta text,
  note_anonime text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  insert into app.patients (user_id, alias_eta, note_anonime)
  values (p_user_id, p_alias_eta, p_note_anonime)
  returning app.patients.id, app.patients.user_id, app.patients.alias_eta, app.patients.note_anonime, app.patients.created_at;
$$;

create or replace function public.app_patients_detail(p_user_id uuid, p_id uuid)
returns table (
  id uuid,
  user_id uuid,
  alias_eta text,
  note_anonime text,
  created_at timestamptz
)
language sql
security definer
set search_path = public, app
as $$
  select p.id, p.user_id, p.alias_eta, p.note_anonime, p.created_at
  from app.patients p
  where p.id = p_id and p.user_id = p_user_id
  limit 1;
$$;

create or replace function public.app_patients_delete(p_user_id uuid, p_id uuid)
returns boolean
language sql
security definer
set search_path = public, app
as $$
  with deleted as (
    delete from app.patients p
    where p.id = p_id and p.user_id = p_user_id
    returning 1
  )
  select exists(select 1 from deleted);
$$;

grant execute on function public.app_patients_list(uuid) to anon, authenticated, service_role;
grant execute on function public.app_patients_create(uuid, text, text) to anon, authenticated, service_role;
grant execute on function public.app_patients_detail(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.app_patients_delete(uuid, uuid) to anon, authenticated, service_role;
