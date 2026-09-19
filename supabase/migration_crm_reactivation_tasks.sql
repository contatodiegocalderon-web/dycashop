-- Tarefas de reativação confirmadas (ciclo reabre se a âncora mudar: nova compra ou novo abandono).

create table if not exists public.crm_reactivation_tasks (
  whatsapp_digits text not null,
  campaign text not null,
  cycle_anchor text not null,
  staff_id uuid references public.staff_users (id) on delete set null,
  completed_at timestamptz not null default now(),
  completed_by_staff_id uuid references public.staff_users (id) on delete set null,
  primary key (whatsapp_digits, campaign, cycle_anchor),
  constraint crm_reactivation_tasks_campaign_chk check (
    campaign in (
      'abandon_new',
      'abandon_repeat',
      'day20',
      'day45',
      'day60'
    )
  ),
  constraint crm_reactivation_tasks_wa_chk check (length(whatsapp_digits) >= 10)
);

create index if not exists crm_reactivation_tasks_staff_id_idx
  on public.crm_reactivation_tasks (staff_id);

create index if not exists crm_reactivation_tasks_completed_at_idx
  on public.crm_reactivation_tasks (completed_at desc);

alter table public.crm_reactivation_tasks enable row level security;

drop policy if exists "crm_reactivation_tasks_deny_all_anon" on public.crm_reactivation_tasks;
create policy "crm_reactivation_tasks_deny_all_anon"
  on public.crm_reactivation_tasks for all
  to anon
  using (false);
