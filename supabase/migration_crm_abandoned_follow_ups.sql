-- Follow-ups de carrinho abandonado (máx. 3 antes de descartar o lead).

create table if not exists public.crm_abandoned_follow_ups (
  whatsapp_digits text primary key
    check (length(whatsapp_digits) >= 10),
  follow_up_count integer not null default 0 check (follow_up_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.crm_abandoned_follow_ups enable row level security;

drop policy if exists "crm_abandoned_follow_ups_deny_all_anon"
  on public.crm_abandoned_follow_ups;
create policy "crm_abandoned_follow_ups_deny_all_anon"
  on public.crm_abandoned_follow_ups for all
  to anon
  using (false);
