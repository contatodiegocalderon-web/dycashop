-- Im públicas do catálogo (sincronização Drive → Supabase Storage)
-- Executar no SQL Editor do Supabase

alter table public.products add column if not exists catalog_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set public = excluded.public;

drop policy if exists "catalog_images_select_public" on storage.objects;

create policy "catalog_images_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'catalog-images');
