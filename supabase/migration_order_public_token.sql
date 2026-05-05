-- Execute no SQL Editor do Supabase se a base já existia sem esta coluna.
alter table public.orders add column if not exists public_token text;

create unique index if not exists orders_public_token_idx on public.orders (public_token)
  where public_token is not null;
