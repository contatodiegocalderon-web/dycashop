-- Comunidade de dropshipping (login próprio, fora da área de membros Kiwify)

create table if not exists public.drop_members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text,
  whatsapp text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.drop_access_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  whatsapp text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists drop_access_requests_status_idx
  on public.drop_access_requests (status, created_at desc);

alter table public.drop_members enable row level security;
alter table public.drop_access_requests enable row level security;
