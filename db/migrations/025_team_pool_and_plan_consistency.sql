-- Share subscription quotas across active team members and prevent mixed-plan
-- team membership.

create or replace function app.get_team_active_member_count(owner_id uuid)
returns integer
language sql
stable
security definer
set search_path = app, public
as $$
  select greatest(1, 1 + count(*)::integer)
  from app.seat_assignments sa
  where sa.owner_user_id = owner_id;
$$;

revoke execute on function app.get_team_active_member_count(uuid) from public, anon, authenticated;
grant execute on function app.get_team_active_member_count(uuid) to service_role;

create or replace function app.enforce_team_member_plan_match()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  owner_plan text;
  member_plan text;
begin
  select p.piano into owner_plan
  from app.profiles p
  where p.id = new.owner_user_id;

  select p.piano into member_plan
  from app.profiles p
  where p.id = new.member_user_id;

  if owner_plan is null or member_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if owner_plan is distinct from member_plan then
    raise exception 'team_plan_mismatch' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_seat_assignments_same_plan on app.seat_assignments;
create trigger trg_seat_assignments_same_plan
before insert or update of owner_user_id, member_user_id on app.seat_assignments
for each row execute function app.enforce_team_member_plan_match();

revoke execute on function app.enforce_team_member_plan_match() from public, anon, authenticated;

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
  active_member_count integer;
begin
  safe_count := greatest(coalesce(sheet_count, 1), 1);
  pool_owner_id := app.get_usage_pool_owner(target_user_id);
  active_member_count := app.get_team_active_member_count(pool_owner_id);

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

  plan_limit := coalesce(plan_limit, 5) * active_member_count;

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

create or replace function app.consume_image_usage(target_user_id uuid, image_count integer default 1)
returns table(used integer, image_limit integer)
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
  active_member_count integer;
begin
  safe_count := greatest(coalesce(image_count, 1), 1);
  pool_owner_id := app.get_usage_pool_owner(target_user_id);
  active_member_count := app.get_team_active_member_count(pool_owner_id);

  select p.piano into user_plan
  from app.profiles p
  where p.id = pool_owner_id
  for update;

  if user_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  counter_column := case
    when user_plan = 'trial' then 'trial_immagini_usate'
    else 'immagini_mese'
  end;

  select sp.image_limit into plan_limit
  from app.subscription_plans sp
  where sp.code = user_plan and sp.active = true
  limit 1;

  plan_limit := coalesce(plan_limit, 5) * active_member_count;

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
    raise exception 'image_limit_reached' using errcode = 'P0001';
  end if;

  used := incremented;
  image_limit := plan_limit;
  return next;
end;
$$;

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
  owner_plan text;
  invited_plan text;
  invited_is_manager boolean;
begin
  normalized_email := lower(trim(invited_email));

  select p.piano into owner_plan
  from app.profiles p
  where p.id = owner_id
  for update;

  if owner_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  select p.piano, p.is_team_manager into invited_plan, invited_is_manager
  from app.profiles p
  where lower(p.email) = normalized_email
  limit 1;

  if invited_plan is null then
    raise exception 'invited_profile_not_found' using errcode = 'P0001';
  end if;

  if invited_is_manager then
    raise exception 'invited_profile_is_manager' using errcode = 'P0001';
  end if;

  if owner_plan is distinct from invited_plan then
    raise exception 'team_plan_mismatch' using errcode = 'P0001';
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
  owner_plan text;
  recipient_plan text;
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

  select p.piano into owner_plan
  from app.profiles p
  where p.id = invitation_row.owner_user_id
  for update;

  select p.piano into recipient_plan
  from app.profiles p
  where p.id = recipient_user_id;

  if owner_plan is null or recipient_plan is null then
    raise exception 'profile_not_found' using errcode = 'P0001';
  end if;

  if owner_plan is distinct from recipient_plan then
    raise exception 'team_plan_mismatch' using errcode = 'P0001';
  end if;

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
