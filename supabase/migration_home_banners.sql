-- Banners do carrossel na página inicial
create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  storage_path text,
  href text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_banners
  add column if not exists image_url_mobile text,
  add column if not exists storage_path_mobile text;

create index if not exists home_banners_sort_active_idx
  on public.home_banners (active, sort_order, created_at);

alter table public.home_banners enable row level security;

drop policy if exists "home_banners_public_read" on public.home_banners;
create policy "home_banners_public_read"
  on public.home_banners
  for select
  to anon, authenticated
  using (active = true);
