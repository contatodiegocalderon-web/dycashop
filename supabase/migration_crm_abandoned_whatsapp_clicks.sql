-- Contagem de cliques no botão WhatsApp (carrinhos abandonados), por cliente.

create table if not exists public.crm_abandoned_whatsapp_clicks (
  whatsapp_digits text primary key,
  click_count integer not null default 0 check (click_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.crm_abandoned_whatsapp_clicks enable row level security;

drop policy if exists "crm_abandoned_whatsapp_clicks_deny_all_anon"
  on public.crm_abandoned_whatsapp_clicks;
create policy "crm_abandoned_whatsapp_clicks_deny_all_anon"
  on public.crm_abandoned_whatsapp_clicks for all
  to anon
  using (false);
