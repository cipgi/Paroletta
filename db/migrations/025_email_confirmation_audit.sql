-- Email confirmation resend audit and rate-limit support.
-- Supabase Auth owns confirmation tokens; this table stores only hashed identifiers.

create table if not exists app.email_confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check (length(email_hash) = 64),
  client_ip_hash text not null check (length(client_ip_hash) = 64),
  status text not null check (
    status in ('sent', 'failed', 'rate_limited', 'suppressed')
  ),
  failure_code text,
  created_at timestamptz not null default now()
);

alter table app.email_confirmation_requests enable row level security;

drop policy if exists "email confirmation requests no direct access"
  on app.email_confirmation_requests;

revoke all on table app.email_confirmation_requests from public, anon, authenticated;
grant select, insert on table app.email_confirmation_requests to service_role;

create index if not exists idx_email_confirmation_requests_email_recent
  on app.email_confirmation_requests(email_hash, created_at desc);

create index if not exists idx_email_confirmation_requests_ip_recent
  on app.email_confirmation_requests(client_ip_hash, created_at desc);
