-- Canal de venda: atacado (WhatsApp) vs varejo (checkout Mercado Pago)
-- Pedidos antigos ficam ATACADO por omissão.

alter table public.orders
  add column if not exists sales_channel text not null default 'ATACADO';

alter table public.orders
  drop constraint if exists orders_sales_channel_check;

alter table public.orders
  add constraint orders_sales_channel_check
  check (sales_channel in ('ATACADO', 'VAREJO'));

create index if not exists orders_sales_channel_status_idx
  on public.orders (sales_channel, status, created_at desc);

-- Referência do pagamento (ex.: id da preferência / payment do Mercado Pago)
alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_external_id text;

create index if not exists orders_payment_external_id_idx
  on public.orders (payment_external_id)
  where payment_external_id is not null;
