-- Allow Paroletta's clinical worksheet types beyond legacy phonological materials.
alter table app.sheets
  drop constraint if exists sheets_tipo_output_check,
  add constraint sheets_tipo_output_check
  check (
    tipo_output in (
      'storia',
      'filastrocca',
      'lista',
      'discriminazione_visiva',
      'morfosintassi_complessa'
    )
  );
