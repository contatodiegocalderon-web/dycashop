-- Ocultar contactos na lista de CRM sem apagar pedidos (histórico mantém-se na base).

create table if not exists public.crm_hidden_contacts (
  whatsapp_digits text primary key
    check (length(whatsapp_digits) >= 10),
  hidden_at timestamptz not null default now()
);

alter table public.crm_hidden_contacts enable row level security;

drop policy if exists "crm_hidden_contacts_deny_all_anon"
  on public.crm_hidden_contacts;
create policy "crm_hidden_contacts_deny_all_anon"
  on public.crm_hidden_contacts for all
  using (false)
  with check (false);
