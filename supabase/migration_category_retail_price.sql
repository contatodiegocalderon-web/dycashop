-- Preço de varejo por categoria (pedidos com menos de 5 peças no carrinho).
alter table public.category_showcase_settings
  add column if not exists retail_price_per_piece numeric(12, 2);

comment on column public.category_showcase_settings.retail_price_per_piece is
  'Preço unitário de varejo (< 5 peças no carrinho). Separado da tabela de atacado.';
