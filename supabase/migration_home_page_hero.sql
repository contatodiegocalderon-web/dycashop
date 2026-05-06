-- Banner opcional no topo da página inicial (URL em Storage)
create table if not exists public.home_page_settings (
  id integer primary key default 1 check (id = 1),
  home_hero_image_url text,
  updated_at timestamptz not null default now()
);

insert into public.home_page_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.home_page_settings enable row level security;

drop policy if exists "home_page_settings_select_public" on public.home_page_settings;
create policy "home_page_settings_select_public"
  on public.home_page_settings for select
  to anon, authenticated
  using (true);
