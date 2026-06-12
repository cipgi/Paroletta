-- Store generated image bytes in Supabase Storage instead of app.illustrations.file_path.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'generated-images',
  'generated-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

alter table app.illustrations
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists byte_size integer;

alter table app.illustrations
  drop constraint if exists illustrations_storage_pair_check,
  add constraint illustrations_storage_pair_check
    check (
      (storage_bucket is null and storage_path is null)
      or (storage_bucket is not null and storage_path is not null)
    );

alter table app.illustrations
  drop constraint if exists illustrations_byte_size_check,
  add constraint illustrations_byte_size_check
    check (byte_size is null or byte_size > 0);

create unique index if not exists idx_illustrations_storage_object
  on app.illustrations(storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;
