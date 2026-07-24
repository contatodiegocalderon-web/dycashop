-- Status operacional dos pedidos varejo (separação / despacho)
alter table public.orders
  add column if not exists varejo_fulfillment_status text;

alter table public.orders
  drop constraint if exists orders_varejo_fulfillment_status_check;

alter table public.orders
  add constraint orders_varejo_fulfillment_status_check
  check (
    varejo_fulfillment_status is null
    or varejo_fulfillment_status in ('EM_ABERTO', 'SEPARADO', 'DESPACHADO')
  );

update public.orders
set varejo_fulfillment_status = 'EM_ABERTO'
where sales_channel = 'VAREJO'
  and varejo_fulfillment_status is null;

create index if not exists orders_varejo_fulfillment_status_idx
  on public.orders (varejo_fulfillment_status)
  where sales_channel = 'VAREJO';
