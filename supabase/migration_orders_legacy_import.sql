-- Pedidos importados de outro sistema (não entram nas métricas de faturamento/lucro)
alter table public.orders
  add column if not exists legacy_import boolean not null default false;

create index if not exists orders_legacy_import_idx
  on public.orders (legacy_import)
  where legacy_import = true;
