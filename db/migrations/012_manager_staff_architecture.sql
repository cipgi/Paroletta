-- Manager/Staff architecture: shared resource pool with private workspaces.
create table if not exists app.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app.profiles(id) on delete cascade,
  email text not null,
  token uuid not null default gen_random_uuid() unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by_user_id uuid not null references app.profiles(id) on delete cascade,
  accepted_by_user_id uuid references app.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (owner_user_id, email)
);

alter table app.organization_invitations enable row level security;

drop policy if exists "invitation manager read/write" on app.organization_invitations;
create policy "invitation manager read/write" on app.organization_invitations
for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists "invitation recipient read" on app.organization_invitations;
create policy "invitation recipient read" on app.organization_invitations
for select using (
  lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
);

create index if not exists idx_seat_assignments_owner on app.seat_assignments(owner_user_id);
create index if not exists idx_seat_assignments_member on app.seat_assignments(member_user_id);
create index if not exists idx_org_invitations_owner_status on app.organization_invitations(owner_user_id, status);

create or replace function app.get_usage_pool_owner(user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    (
      select sa.owner_user_id
      from app.seat_assignments sa
      where sa.member_user_id = user_id
      limit 1
    ),
    user_id
  );
$$;

-- Count every generated sheet against the manager-owned shared pool while
-- keeping the sheet itself private under the generating user's workspace.
create or replace function app.enforce_and_count_sheet_usage()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  pool_owner_id uuid;
  user_plan text;
  counter_column text;
  plan_limit integer;
  incremented integer;
begin
  pool_owner_id := app.get_usage_pool_owner(new.user_id);

  select p.piano into user_plan
  from app.profiles p
  where p.id = pool_owner_id
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
  using pool_owner_id, plan_limit;

  if incremented is null then
    raise exception 'sheet_limit_reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
