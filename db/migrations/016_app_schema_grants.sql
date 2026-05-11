-- Allow Supabase PostgREST roles to access the custom `app` schema.
-- RLS policies still decide which rows authenticated users can read/write, while
-- the service-role key is used only by server-side admin operations.
grant usage on schema app to authenticated, service_role;

grant select, insert, update, delete on all tables in schema app to authenticated;
grant all privileges on all tables in schema app to service_role;

grant usage, select on all sequences in schema app to authenticated;
grant all privileges on all sequences in schema app to service_role;

grant execute on all functions in schema app to authenticated, service_role;

alter default privileges in schema app
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema app
  grant all privileges on tables to service_role;
alter default privileges in schema app
  grant usage, select on sequences to authenticated;
alter default privileges in schema app
  grant all privileges on sequences to service_role;
alter default privileges in schema app
  grant execute on functions to authenticated, service_role;
