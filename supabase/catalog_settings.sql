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

create table if not exists public.category_showcase_settings (
  category_label text primary key,
  video_url text,
  video_poster_url text,
  wholesale_tiers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.category_showcase_settings enable row level security;

drop policy if exists "category_showcase_settings_select_public"
  on public.category_showcase_settings;
create policy "category_showcase_settings_select_public"
  on public.category_showcase_settings for select
  using (true);

drop policy if exists "category_showcase_settings_deny_all_anon"
  on public.category_showcase_settings;
create policy "category_showcase_settings_deny_all_anon"
  on public.category_showcase_settings for all
  using (false)
  with check (false);
