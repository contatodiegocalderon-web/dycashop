alter table public.orders
  add column if not exists sale_amount_by_category jsonb;

