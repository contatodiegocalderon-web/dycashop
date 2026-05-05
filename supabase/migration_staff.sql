-- Contas de equipa (dono + vendedor) e autoria da confirmação do pedido

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'seller')),
  created_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists confirmed_by_staff_id uuid references public.staff_users (id);

create index if not exists orders_confirmed_by_staff_id_idx
  on public.orders (confirmed_by_staff_id);

alter table public.staff_users enable row level security;
