-- Pedido com vendedor escolhido no checkout + nomes em staff + reset de métricas

alter table public.orders
  add column if not exists requested_seller_name text,
  add column if not exists requested_seller_phone text;

alter table public.staff_users
  add column if not exists full_name text;

