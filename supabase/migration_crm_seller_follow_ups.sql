-- Follow-up por vendedor (ciclo por última compra; recompra reabre após nova venda).

create table if not exists public.crm_seller_follow_ups (
  whatsapp_digits text not null,
  staff_id uuid not null references public.staff_users (id) on delete cascade,
  follow_up_completed_at timestamptz not null default now(),
  primary key (whatsapp_digits, staff_id)
);

create index if not exists crm_seller_follow_ups_staff_id_idx
  on public.crm_seller_follow_ups (staff_id);

alter table public.crm_seller_follow_ups enable row level security;

drop policy if exists "crm_seller_follow_ups_deny_all_anon" on public.crm_seller_follow_ups;
create policy "crm_seller_follow_ups_deny_all_anon"
  on public.crm_seller_follow_ups for all
  to anon
  using (false);

-- Migra conclusões antigas (por vendedor) a partir de crm_client_profiles.
insert into public.crm_seller_follow_ups (whatsapp_digits, staff_id, follow_up_completed_at)
select
  whatsapp_digits,
  follow_up_completed_by_staff_id,
  follow_up_completed_at
from public.crm_client_profiles
where
  follow_up_completed_at is not null
  and follow_up_completed_by_staff_id is not null
on conflict (whatsapp_digits, staff_id) do nothing;
