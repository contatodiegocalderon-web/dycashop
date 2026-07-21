-- Preço de varejo (1–9 peças) por categoria, usado no checkout Mercado Pago.

alter table public.category_showcase_settings
  add column if not exists retail_price numeric(12,2);

comment on column public.category_showcase_settings.retail_price is
  'Preço unitário de varejo (1 a 9 peças). Null = ainda não configurado.';
