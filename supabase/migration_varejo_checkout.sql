-- Checkout varejo (Mercado Pago + SuperFrete)
alter table public.orders
  add column if not exists shipping_address jsonb,
  add column if not exists shipping_cost numeric(12,2),
  add column if not exists shipping_service text,
  add column if not exists checkout_channel text,
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text;

create index if not exists orders_checkout_channel_idx
  on public.orders (checkout_channel);

create index if not exists orders_mp_preference_id_idx
  on public.orders (mp_preference_id)
  where mp_preference_id is not null;
