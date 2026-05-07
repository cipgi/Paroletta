-- Remove the legacy patients subsystem completely.
drop function if exists public.app_patients_list(uuid);
drop function if exists public.app_patients_create(uuid, text, text);
drop function if exists public.app_patients_detail(uuid, uuid);
drop function if exists public.app_patients_delete(uuid, uuid);
drop function if exists app.app_patients_list(uuid);
drop function if exists app.app_patients_create(uuid, text, text);
drop function if exists app.app_patients_detail(uuid, uuid);
drop function if exists app.app_patients_delete(uuid, uuid);

drop index if exists app.idx_sheets_patient;
alter table if exists app.sheets drop constraint if exists sheets_patient_id_fkey;
alter table if exists app.sheets drop column if exists patient_id;

drop table if exists app.patients cascade;
