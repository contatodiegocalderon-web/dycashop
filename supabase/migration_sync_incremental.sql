-- Sincronização incremental de imagens (Drive → Storage)
alter table public.products add column if not exists drive_updated_at timestamptz;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists sync_status text default 'pending';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_sync_status_check') then
    alter table public.products add constraint products_sync_status_check
      check (sync_status is null or sync_status in ('pending', 'done', 'error'));
  end if;
end $$;

-- Migra legado catalog_image_url → image_url
update public.products
set image_url = catalog_image_url
where image_url is null and catalog_image_url is not null;

-- Produtos que já tinham URL no Storage: marcar como done e fixar drive_updated_at provisório
update public.products
set
  sync_status = 'done',
  drive_updated_at = coalesce(drive_updated_at, updated_at)
where image_url is not null
  and (sync_status is null or sync_status = 'pending');

update public.products
set sync_status = 'pending'
where image_url is null and (sync_status is null);
