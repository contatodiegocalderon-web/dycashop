-- Streetwear catalog MVP — execute no SQL Editor do Supabase
-- https://supabase.com/dashboard

create extension if not exists "pgcrypto";

-- Produtos sincronizados do Google Drive (identidade única: drive_file_id)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  drive_image_url text not null,
  catalog_image_url text,
  drive_updated_at timestamptz,
  image_url text,
  sync_status text default 'pending'
    check (sync_status is null or sync_status in ('pending', 'done', 'error')),
  original_file_name text not null,
  category text,
  brand text not null,
  color text not null,
  size text not null check (size in ('M', 'G', 'GG')),
  stock integer not null default 0 check (stock >= 0),
  sku text not null unique,
  status text not null default 'ATIVO' check (status in ('ATIVO', 'ESGOTADO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_catalog_idx
  on public.products (status, size, brand, color);

create table if not exists public.staff_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'seller')),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'PENDENTE_PAGAMENTO'
    check (status in ('PENDENTE_PAGAMENTO', 'PAGO', 'CANCELADO')),
  customer_note text,
  public_token text unique,
  sale_amount numeric(12,2),
  sale_amount_by_category jsonb,
  customer_name text,
  customer_whatsapp text,
  customer_segment text,
  confirmed_at timestamptz,
  confirmed_by_staff_id uuid references public.staff_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_confirmed_by_staff_id_idx
  on public.orders (confirmed_by_staff_id);

create unique index if not exists orders_public_token_idx on public.orders (public_token)
  where public_token is not null;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  quantity integer not null check (quantity > 0),
  snapshot_image_url text not null,
  snapshot_original_name text not null,
  snapshot_brand text not null,
  snapshot_color text not null,
  snapshot_size text not null,
  snapshot_drive_file_id text not null,
  snapshot_category text,
  created_at timestamptz not null default now()
);

-- Custo por peça para cálculo de lucro (nome deve coincidir com products.category)
create table if not exists public.category_cost_defaults (
  category_label text primary key,
  cost_per_piece numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.category_showcase_settings (
  category_label text primary key,
  video_url text,
  video_poster_url text,
  wholesale_tiers jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.category_cost_defaults (category_label, cost_per_piece)
  values ('Sem categoria', 0)
  on conflict (category_label) do nothing;

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- Atualiza updated_at em products
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute procedure public.set_updated_at();

-- RLS: catálogo público só lê produtos ativos; pedidos só via service role / API
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

alter table public.category_cost_defaults enable row level security;
alter table public.category_showcase_settings enable row level security;

create policy "category_cost_defaults_deny_all_anon"
  on public.category_cost_defaults for all
  using (false)
  with check (false);

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

-- Leitura anônima apenas para vitrine (ativos com estoque)
create policy "products_select_catalog"
  on public.products for select
  using (status = 'ATIVO' and stock > 0);

-- Sem acesso direto de escrita/leitura de orders para anon (use API + service role)
create policy "orders_deny_all_anon"
  on public.orders for all
  using (false)
  with check (false);

create policy "order_items_deny_all_anon"
  on public.order_items for all
  using (false)
  with check (false);

-- Opcional: permitir service role bypassa RLS automaticamente no Supabase

-- Configuração do catálogo (link da pasta + OAuth refresh token); só o backend (service role) escreve
create table if not exists public.catalog_settings (
  id integer primary key default 1 check (id = 1),
  drive_folder_id text,
  google_refresh_token text,
  updated_at timestamptz not null default now()
);

insert into public.catalog_settings (id) values (1)
  on conflict (id) do nothing;

alter table public.catalog_settings enable row level security;

