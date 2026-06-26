-- Track whether generated worksheet content targets a child or an adult.
alter table app.sheets
  add column if not exists target_audience text not null default 'bambino';

alter table app.sheets
  drop constraint if exists sheets_target_audience_check,
  add constraint sheets_target_audience_check
  check (target_audience in ('bambino', 'adulto'));
