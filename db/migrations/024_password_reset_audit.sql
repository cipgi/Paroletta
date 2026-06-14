-- Password reset audit and rate-limit support.
-- Supabase Auth owns recovery tokens; this table stores only hashed identifiers.

create table if not exists app.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check (length(email_hash) = 64),
  client_ip_hash text not null check (length(client_ip_hash) = 64),
  status text not null check (
    status in ('sent', 'failed', 'rate_limited', 'suppressed')
  ),
  failure_code text,
  created_at timestamptz not null default now()
);

alter table app.password_reset_requests enable row level security;

drop policy if exists "password reset requests no direct access"
  on app.password_reset_requests;

revoke all on table app.password_reset_requests from public, anon, authenticated;
grant select, insert on table app.password_reset_requests to service_role;

create index if not exists idx_password_reset_requests_email_recent
  on app.password_reset_requests(email_hash, created_at desc);

create index if not exists idx_password_reset_requests_ip_recent
  on app.password_reset_requests(client_ip_hash, created_at desc);
