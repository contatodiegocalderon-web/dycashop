-- Papel de gestor: visualização de histórico e métricas (sem alterações).

alter table public.staff_users drop constraint if exists staff_users_role_check;

alter table public.staff_users
  add constraint staff_users_role_check
  check (role in ('owner', 'seller', 'gestor'));
