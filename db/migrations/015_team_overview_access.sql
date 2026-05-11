-- Allow the Gestione page to load with the signed-in user's token for managers,
-- staff members, standalone users, and users who have pending invitations.

create or replace function app.is_team_member_of_owner(owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
    from app.seat_assignments sa
    where sa.owner_user_id = owner_id
      and sa.member_user_id = auth.uid()
  );
$$;

create or replace function app.can_read_team_profile(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select
    auth.uid() = profile_id
    or exists (
      select 1
      from app.seat_assignments sa
      where sa.owner_user_id = auth.uid()
        and sa.member_user_id = profile_id
    )
    or exists (
      select 1
      from app.seat_assignments me
      where me.member_user_id = auth.uid()
        and (
          me.owner_user_id = profile_id
          or exists (
            select 1
            from app.seat_assignments teammate
            where teammate.owner_user_id = me.owner_user_id
              and teammate.member_user_id = profile_id
          )
        )
    )
    or exists (
      select 1
      from app.organization_invitations oi
      where oi.owner_user_id = profile_id
        and oi.status = 'pending'
        and lower(oi.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    );
$$;

-- Managers can read staff profiles, staff can read the manager and teammates,
-- and invited users can read the inviting manager shown in the invite card.
drop policy if exists "profile manager team read" on app.profiles;
drop policy if exists "profile team overview read" on app.profiles;
create policy "profile team overview read" on app.profiles
for select using (app.can_read_team_profile(app.profiles.id));

-- Staff need read access to the manager subscription to show the shared plan and
-- seat usage in Gestione. Owners keep their normal read/write policy.
drop policy if exists "subscription team overview read" on app.subscriptions;
create policy "subscription team overview read" on app.subscriptions
for select using (
  auth.uid() = user_id
  or app.is_team_member_of_owner(app.subscriptions.user_id)
);

-- Staff can see the team roster rows for the owner they belong to, without
-- granting write access.
drop policy if exists "seat team overview read" on app.seat_assignments;
create policy "seat team overview read" on app.seat_assignments
for select using (
  auth.uid() = owner_user_id
  or auth.uid() = member_user_id
  or app.is_team_member_of_owner(app.seat_assignments.owner_user_id)
);
