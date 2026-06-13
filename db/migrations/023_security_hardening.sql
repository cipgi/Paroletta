-- Security hardening for sessions, entitlements, image cache, quotas and teams.

-- Public onboarding must not default to the high-quota development plan.
update app.subscription_plans
set active = false,
    updated_at = now()
where code = 'sviluppo';

alter table app.profiles
alter column piano set default 'trial';

alter table app.subscriptions
alter column plan set default 'trial';

alter table app.subscriptions
alter column status set default 'trial';

update app.subscriptions
set
  status = 'trial',
  plan = 'trial',
  seats_count = 1,
  current_period_start = now(),
  current_period_end = now() + interval '15 days',
  cancel_at_period_end = false,
  updated_at = now()
where plan = 'sviluppo';

update app.profiles
set
  piano = 'trial',
  seats = 1,
  updated_at = now()
where piano = 'sviluppo';

-- Users may read and update ordinary profile fields, but entitlement and quota
-- fields are server-managed.
drop policy if exists "profile owner read/write" on app.profiles;
drop policy if exists "profile owner read" on app.profiles;
drop policy if exists "profile owner limited update" on app.profiles;

create policy "profile owner read" on app.profiles
for select using (auth.uid() = id);

create policy "profile owner limited update" on app.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function app.prevent_profile_entitlement_self_update()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if jwt_role in ('', 'service_role')
     or current_setting('app.internal_entitlement_update', true) = 'true' then
    return new;
  end if;

  if old.role is distinct from new.role
     or old.piano is distinct from new.piano
     or old.seats is distinct from new.seats
     or old.trial_schede_usate is distinct from new.trial_schede_usate
     or old.schede_mese is distinct from new.schede_mese
     or old.trial_immagini_usate is distinct from new.trial_immagini_usate
     or old.immagini_mese is distinct from new.immagini_mese then
    raise exception 'profile_entitlement_fields_admin_only' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_entitlement_admin_only on app.profiles;
create trigger trg_profiles_entitlement_admin_only
before update of role, piano, seats, trial_schede_usate, schede_mese, trial_immagini_usate, immagini_mese
on app.profiles
for each row execute function app.prevent_profile_entitlement_self_update();

-- Subscription rows are server-managed. Owners can read them, but cannot
-- self-upgrade plan/status/seats through PostgREST.
drop policy if exists "sub owner read/write" on app.subscriptions;
drop policy if exists "sub owner read" on app.subscriptions;

create policy "sub owner read" on app.subscriptions
for select using (auth.uid() = user_id);

create or replace function app.prevent_subscription_self_write()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if jwt_role not in ('', 'service_role') then
    raise exception 'subscription_admin_only' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_admin_only on app.subscriptions;
create trigger trg_subscriptions_admin_only
before insert or update or delete on app.subscriptions
for each row execute function app.prevent_subscription_self_write();

-- Bind generated image cache rows to the owning sheet before signing storage
-- URLs. The semantic cache key is no longer globally unique for generated media.
alter table app.illustrations
  add column if not exists owner_user_id uuid references app.profiles(id) on delete cascade,
  add column if not exists sheet_id uuid references app.sheets(id) on delete cascade;

drop index if exists idx_illustrations_cache_key;

create unique index if not exists idx_illustrations_owner_sheet_cache_key
  on app.illustrations(owner_user_id, sheet_id, cache_key);

create index if not exists idx_illustrations_cache_key_lookup
  on app.illustrations(cache_key);

drop policy if exists "illustrations readable by authenticated" on app.illustrations;
drop policy if exists "illustrations owner read" on app.illustrations;

create policy "illustrations owner read" on app.illustrations
for select using (
  owner_user_id = auth.uid()
  or (owner_user_id is null and source <> 'generated')
);

-- Sheet quota can be reserved before OpenAI work. Inserts performed by the
-- service role with usage_counted=true are treated as already charged; direct
-- user inserts still close quota in the trigger.
alter table app.sheets
add column if not exists usage_counted boolean not null default false;

create or replace function app.consume_sheet_usage(target_user_id uuid, sheet_count integer default 1)
returns table(used integer, sheet_limit integer)
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
  safe_count integer;
begin
  safe_count := greatest(coalesce(sheet_count, 1), 1);
  pool_owner_id := app.get_usage_pool_owner(target_user_id);

  select p.piano into user_plan
  from app.profiles p
  where p.id = pool_owner_id
  for update;

  if user_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  counter_column := case
    when user_plan = 'trial' then 'trial_schede_usate'
    else 'schede_mese'
  end;

  select sp.sheet_limit into plan_limit
  from app.subscription_plans sp
  where sp.code = user_plan and sp.active = true
  limit 1;

  if plan_limit is null then
    plan_limit := 5;
  end if;

  perform set_config('app.internal_entitlement_update', 'true', true);
  begin
    execute format(
      'update app.profiles set %I = %I + $2 where id = $1 and %I <= $3 - $2 returning %I',
      counter_column,
      counter_column,
      counter_column,
      counter_column
    )
    into incremented
    using pool_owner_id, safe_count, plan_limit;
    perform set_config('app.internal_entitlement_update', 'false', true);
  exception when others then
    perform set_config('app.internal_entitlement_update', 'false', true);
    raise;
  end;

  if incremented is null then
    raise exception 'sheet_limit_reached' using errcode = 'P0001';
  end if;

  used := incremented;
  sheet_limit := plan_limit;
  return next;
end;
$$;

create or replace function app.release_sheet_usage(target_user_id uuid, sheet_count integer default 1)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  pool_owner_id uuid;
  user_plan text;
  counter_column text;
  safe_count integer;
begin
  safe_count := greatest(coalesce(sheet_count, 1), 1);
  pool_owner_id := app.get_usage_pool_owner(target_user_id);

  select p.piano into user_plan
  from app.profiles p
  where p.id = pool_owner_id
  for update;

  if user_plan is null then
    return;
  end if;

  counter_column := case
    when user_plan = 'trial' then 'trial_schede_usate'
    else 'schede_mese'
  end;

  perform set_config('app.internal_entitlement_update', 'true', true);
  begin
    execute format(
      'update app.profiles set %I = greatest(%I - $2, 0) where id = $1',
      counter_column,
      counter_column
    )
    using pool_owner_id, safe_count;
    perform set_config('app.internal_entitlement_update', 'false', true);
  exception when others then
    perform set_config('app.internal_entitlement_update', 'false', true);
    raise;
  end;
end;
$$;

create or replace function app.enforce_and_count_sheet_usage()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  jwt_role text;
begin
  if new.usage_counted then
    jwt_role := coalesce(current_setting('request.jwt.claim.role', true), '');
    if jwt_role not in ('', 'service_role') then
      raise exception 'usage_counted_admin_only' using errcode = '42501';
    end if;
    return new;
  end if;

  perform 1 from app.consume_sheet_usage(new.user_id, 1);
  new.usage_counted := true;
  return new;
end;
$$;

-- Prevent direct authenticated relationship enumeration through the
-- security-definer usage-pool helper and quota mutation RPCs.
revoke execute on function app.get_usage_pool_owner(uuid) from public, anon, authenticated;
revoke execute on function app.consume_image_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function app.release_image_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function app.consume_sheet_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function app.release_sheet_usage(uuid, integer) from public, anon, authenticated;

grant execute on function app.get_usage_pool_owner(uuid) to service_role;
grant execute on function app.consume_image_usage(uuid, integer) to service_role;
grant execute on function app.release_image_usage(uuid, integer) to service_role;
grant execute on function app.consume_sheet_usage(uuid, integer) to service_role;
grant execute on function app.release_sheet_usage(uuid, integer) to service_role;

-- Atomic team invitation creation. Capacity is checked under the owner's row
-- lock so concurrent invite/accept requests cannot oversubscribe seats.
create or replace function app.create_organization_invitation(
  owner_id uuid,
  invited_email text,
  invited_by_id uuid
)
returns table(id uuid, email text, status text, token uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = app, public
as $$
declare
  seats_limit integer;
  member_count integer;
  pending_count integer;
  normalized_email text;
begin
  normalized_email := lower(trim(invited_email));

  perform 1 from app.profiles p where p.id = owner_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from app.profiles p
    where lower(p.email) = normalized_email
      and p.is_team_manager = true
  ) then
    raise exception 'invited_profile_is_manager' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from app.profiles p
    join app.seat_assignments sa on sa.member_user_id = p.id
    where lower(p.email) = normalized_email
  ) then
    raise exception 'account_already_in_team' using errcode = 'P0001';
  end if;

  select least(coalesce(s.seats_count, p.seats, 1), 4) into seats_limit
  from app.profiles p
  left join app.subscriptions s on s.user_id = p.id
  where p.id = owner_id;

  select count(*)::integer into member_count
  from app.seat_assignments sa
  where sa.owner_user_id = owner_id;

  select count(*)::integer into pending_count
  from app.organization_invitations oi
  where oi.owner_user_id = owner_id
    and oi.status = 'pending'
    and lower(oi.email) <> normalized_email;

  if 1 + member_count + pending_count >= coalesce(seats_limit, 1) then
    raise exception 'team_seat_limit_reached' using errcode = 'P0001';
  end if;

  return query
  insert into app.organization_invitations (
    owner_user_id,
    email,
    status,
    invited_by_user_id,
    accepted_by_user_id,
    accepted_at,
    revoked_at
  )
  values (
    owner_id,
    normalized_email,
    'pending',
    invited_by_id,
    null,
    null,
    null
  )
  on conflict (owner_user_id, email) do update
  set
    status = 'pending',
    invited_by_user_id = excluded.invited_by_user_id,
    accepted_by_user_id = null,
    accepted_at = null,
    revoked_at = null
  returning
    organization_invitations.id,
    organization_invitations.email,
    organization_invitations.status,
    organization_invitations.token,
    organization_invitations.created_at;
end;
$$;

create or replace function app.accept_organization_invitation(
  invitation_token uuid,
  recipient_user_id uuid,
  recipient_email text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  invitation_row app.organization_invitations%rowtype;
  seats_limit integer;
  member_count integer;
  normalized_email text;
begin
  normalized_email := lower(trim(recipient_email));

  select * into invitation_row
  from app.organization_invitations oi
  where oi.token = invitation_token
  for update;

  if invitation_row.id is null or invitation_row.status <> 'pending' then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;

  if lower(invitation_row.email) <> normalized_email then
    raise exception 'invitation_email_mismatch' using errcode = 'P0001';
  end if;

  perform 1
  from app.profiles p
  where p.id = invitation_row.owner_user_id
  for update;

  if exists (
    select 1
    from app.seat_assignments sa
    where sa.member_user_id = recipient_user_id
  ) then
    raise exception 'account_already_in_team' using errcode = 'P0001';
  end if;

  select least(coalesce(s.seats_count, p.seats, 1), 4) into seats_limit
  from app.profiles p
  left join app.subscriptions s on s.user_id = p.id
  where p.id = invitation_row.owner_user_id;

  select count(*)::integer into member_count
  from app.seat_assignments sa
  where sa.owner_user_id = invitation_row.owner_user_id;

  if 1 + member_count >= coalesce(seats_limit, 1) then
    raise exception 'team_seat_limit_reached' using errcode = 'P0001';
  end if;

  insert into app.seat_assignments (owner_user_id, member_user_id)
  values (invitation_row.owner_user_id, recipient_user_id);

  update app.organization_invitations
  set
    status = 'accepted',
    accepted_by_user_id = recipient_user_id,
    accepted_at = now(),
    revoked_at = null
  where id = invitation_row.id
    and status = 'pending';

  if not found then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function app.create_organization_invitation(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function app.accept_organization_invitation(uuid, uuid, text) from public, anon, authenticated;

grant execute on function app.create_organization_invitation(uuid, text, uuid) to service_role;
grant execute on function app.accept_organization_invitation(uuid, uuid, text) to service_role;
