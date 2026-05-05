-- Copiar para Supabase → SQL Editor → Run (uma vez por projeto)
-- Guarda pasta do Drive + refresh token OAuth

create table if not exists public.catalog_settings (
  id integer primary key default 1 check (id = 1),
  drive_folder_id text,
  google_refresh_token text,
  updated_at timestamptz not null default now()
);

insert into public.catalog_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.catalog_settings enable row level security;
