-- App schema (Supabase Postgres)
create extension if not exists pgcrypto;
create schema if not exists app;

create table if not exists app.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  first_name text,
  last_name text,
  role text not null default 'user',
  piano text not null default 'trial' check (piano in ('trial','base')),
  seats integer not null default 1 check (seats > 0),
  trial_schede_usate integer not null default 0 check (trial_schede_usate >= 0),
  schede_mese integer not null default 0 check (schede_mese >= 0),
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references app.profiles(id) on delete cascade,
  status text not null default 'trial' check (status in ('trial','attivo','cancellato')),
  plan text not null default 'trial' check (plan in ('trial','base')),
  seats_count integer not null default 1 check (seats_count > 0),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  alias_eta text,
  note_anonime text,
  birth_year integer check (birth_year between 1900 and extract(year from now())::integer),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.illustrations (
  id uuid primary key default gen_random_uuid(),
  tag text not null unique,
  file_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists app.sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  patient_id uuid references app.patients(id) on delete set null,
  fonema text not null,
  interesse text not null,
  tipo_output text not null check (tipo_output in ('storia','filastrocca','lista')),
  testo_generato text not null,
  tag_immagine text,
  lista_parole text[],
  difficolta text not null default 'media' check (difficolta in ('bassa','media','alta')),
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app.seat_assignments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app.profiles(id) on delete cascade,
  member_user_id uuid not null references app.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_user_id, member_user_id),
  check (owner_user_id <> member_user_id)
);

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on app.profiles;
create trigger trg_profiles_updated_at before update on app.profiles
for each row execute function app.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on app.subscriptions;
create trigger trg_subscriptions_updated_at before update on app.subscriptions
for each row execute function app.set_updated_at();

drop trigger if exists trg_patients_updated_at on app.patients;
create trigger trg_patients_updated_at before update on app.patients
for each row execute function app.set_updated_at();

drop trigger if exists trg_sheets_updated_at on app.sheets;
create trigger trg_sheets_updated_at before update on app.sheets
for each row execute function app.set_updated_at();

alter table app.profiles enable row level security;
alter table app.subscriptions enable row level security;
alter table app.patients enable row level security;
alter table app.sheets enable row level security;
alter table app.seat_assignments enable row level security;
alter table app.illustrations enable row level security;

drop policy if exists "profile owner read/write" on app.profiles;
create policy "profile owner read/write" on app.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "sub owner read/write" on app.subscriptions;
create policy "sub owner read/write" on app.subscriptions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "patients owner read/write" on app.patients;
create policy "patients owner read/write" on app.patients
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sheets owner read/write" on app.sheets;
create policy "sheets owner read/write" on app.sheets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "seat owner or member read" on app.seat_assignments;
create policy "seat owner or member read" on app.seat_assignments
for select using (auth.uid() = owner_user_id or auth.uid() = member_user_id);

drop policy if exists "seat owner write" on app.seat_assignments;
create policy "seat owner write" on app.seat_assignments
for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists "illustrations readable by authenticated" on app.illustrations;
create policy "illustrations readable by authenticated" on app.illustrations
for select using (auth.role() = 'authenticated');

create index if not exists idx_patients_user on app.patients(user_id);
create index if not exists idx_sheets_user_created on app.sheets(user_id, created_at desc);
create index if not exists idx_sheets_patient on app.sheets(patient_id);
