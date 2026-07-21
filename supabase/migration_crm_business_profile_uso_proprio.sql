-- Adiciona perfil "uso_proprio" à classificação de clientes.

alter table public.crm_client_profiles
  drop constraint if exists crm_client_profiles_business_profile_check;

alter table public.crm_client_profiles
  add constraint crm_client_profiles_business_profile_check
  check (business_profile in ('lojista', 'revendedor', 'uso_proprio'));
