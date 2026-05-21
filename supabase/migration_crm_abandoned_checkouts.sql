-- Carrinhos abandonados: WhatsApp + itens sem pedido finalizado.

create table if not exists public.crm_abandoned_checkouts (
  whatsapp_digits text primary key,
  customer_name text,
  cart_items jsonb not null default '[]'::jsonb,
  distinct_products integer not null default 0,
  total_quantity integer not null default 0,
  last_seen_at timestamptz not null default now(),
  converted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_abandoned_checkouts_active_last_seen_idx
  on public.crm_abandoned_checkouts (last_seen_at desc)
  where converted_at is null;

alter table public.crm_abandoned_checkouts enable row level security;

drop policy if exists "crm_abandoned_checkouts_deny_all_anon" on public.crm_abandoned_checkouts;
create policy "crm_abandoned_checkouts_deny_all_anon"
  on public.crm_abandoned_checkouts for all
  to anon
  using (false);
