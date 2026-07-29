-- Ocultar banner do topo na página da categoria (mantém a imagem guardada).
alter table public.category_showcase_settings
  add column if not exists catalog_banner_hidden boolean not null default false;

comment on column public.category_showcase_settings.catalog_banner_hidden is
  'Se true, não mostra o banner no topo de /categoria (a URL da imagem permanece).';
