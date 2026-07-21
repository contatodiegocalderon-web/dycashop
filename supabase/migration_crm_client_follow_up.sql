-- Follow-up CRM: chamada após 5 dias da 1.ª venda + perfil lojista/revendedor.

create table if not exists public.crm_client_profiles (
  whatsapp_digits text primary key,
  follow_up_completed_at timestamptz,
  business_profile text check (business_profile in ('lojista', 'revendedor')),
  follow_up_completed_by_staff_id uuid references public.staff_users (id),
  updated_at timestamptz not null default now()
);

create index if not exists crm_client_profiles_business_profile_idx
  on public.crm_client_profiles (business_profile);

drop trigger if exists crm_client_profiles_updated_at on public.crm_client_profiles;
create trigger crm_client_profiles_updated_at
  before update on public.crm_client_profiles
  for each row execute function public.set_updated_at();

alter table public.crm_client_profiles enable row level security;

drop policy if exists "crm_client_profiles_deny_all_anon" on public.crm_client_profiles;
create policy "crm_client_profiles_deny_all_anon"
  on public.crm_client_profiles for all
  to anon
  using (false);
