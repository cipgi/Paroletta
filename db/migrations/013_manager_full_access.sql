-- Give managers operational access to their team while preserving staff-owned workspaces.

-- Managers can read staff profiles for roster views and attribution.
drop policy if exists "profile manager team read" on app.profiles;
create policy "profile manager team read" on app.profiles
for select using (
  auth.uid() = id
  or exists (
    select 1
    from app.seat_assignments sa
    where sa.owner_user_id = auth.uid()
      and sa.member_user_id = app.profiles.id
  )
);

-- Managers can read all generated sheets owned by their direct subaccounts.
drop policy if exists "sheets manager team read" on app.sheets;
create policy "sheets manager team read" on app.sheets
for select using (
  auth.uid() = user_id
  or exists (
    select 1
    from app.seat_assignments sa
    where sa.owner_user_id = auth.uid()
      and sa.member_user_id = app.sheets.user_id
  )
);

-- Invited users can accept a pending seat assignment for the invited email.
drop policy if exists "seat invited member insert" on app.seat_assignments;
create policy "seat invited member insert" on app.seat_assignments
for insert with check (
  auth.uid() = member_user_id
  and exists (
    select 1
    from app.organization_invitations oi
    where oi.owner_user_id = app.seat_assignments.owner_user_id
      and lower(oi.email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
      and oi.status = 'pending'
  )
);

-- Invited users can mark their own pending invitation as accepted.
drop policy if exists "invitation recipient accept" on app.organization_invitations;
create policy "invitation recipient accept" on app.organization_invitations
for update using (
  lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  and status = 'pending'
) with check (
  lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  and status = 'accepted'
  and accepted_by_user_id = auth.uid()
);
