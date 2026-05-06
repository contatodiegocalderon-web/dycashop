-- Capa da grelha da página inicial vs banner da página da categoria (executar uma vez no SQL Editor).

alter table public.category_showcase_settings
  add column if not exists home_grid_cover_image_url text;

comment on column public.category_showcase_settings.home_grid_cover_image_url is
  'Imagem de fundo do cartão na grelha da página inicial.';

comment on column public.category_showcase_settings.catalog_cover_image_url is
  'Banner largo no topo ao abrir /categoria/[slug].';

-- Quem já tinha uma única capa: repetir na grelha para não perder a imagem nos cartões.
update public.category_showcase_settings
set home_grid_cover_image_url = catalog_cover_image_url
where catalog_cover_image_url is not null
  and trim(catalog_cover_image_url) <> ''
  and (
    home_grid_cover_image_url is null
    or trim(home_grid_cover_image_url) = ''
  );
