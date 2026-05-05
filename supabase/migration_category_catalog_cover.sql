-- Execute no SQL Editor do Supabase (uma vez por projeto), ou via migração aplicada no CI.
-- Já aplicada no projeto ligado ao MCP quando possível.
-- Capa na home + ordem de apresentação das categorias

alter table public.category_showcase_settings
  add column if not exists catalog_cover_image_url text;

alter table public.category_showcase_settings
  add column if not exists display_order integer not null default 100000;

comment on column public.category_showcase_settings.display_order is
  'Menor valor = aparece primeiro na home. Predefinição alta até reordenar no admin.';
