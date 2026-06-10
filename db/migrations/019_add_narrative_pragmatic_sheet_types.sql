-- Add narrative sequencing and pragmatic language worksheet types.
alter table app.sheets
  drop constraint if exists sheets_tipo_output_check,
  add constraint sheets_tipo_output_check
  check (
    tipo_output in (
      'storia',
      'filastrocca',
      'lista',
      'discriminazione_visiva',
      'morfosintassi_complessa',
      'narrazione_sequenze',
      'pragmatica'
    )
  );
