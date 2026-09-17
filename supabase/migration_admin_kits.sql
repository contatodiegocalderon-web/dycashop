-- Produtos cadastrados no admin (KITs PRONTOS), independentes do Google Drive.

alter table public.products
  add column if not exists source text not null default 'drive';

alter table public.products
  drop constraint if exists products_source_check;

alter table public.products
  add constraint products_source_check
  check (source in ('drive', 'admin'));

alter table public.products
  add column if not exists unit_price numeric(12,2);

alter table public.products
  drop constraint if exists products_unit_price_check;

alter table public.products
  add constraint products_unit_price_check
  check (unit_price is null or unit_price >= 0);

create index if not exists products_source_idx
  on public.products (source);

create index if not exists products_category_source_idx
  on public.products (category, source);

comment on column public.products.source is
  'drive = sincronizado do Google Drive; admin = cadastro manual (KITs PRONTOS)';
comment on column public.products.unit_price is
  'Preço unitário de vitrine para produtos manuais (kits)';

insert into public.category_showcase_settings (category_label)
values ('KITs PRONTOS')
on conflict (category_label) do nothing;
