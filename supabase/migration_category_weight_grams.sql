-- Peso por peça (gramas) para cálculo de frete no carrinho.
alter table public.category_cost_defaults
  add column if not exists weight_grams_per_piece integer not null default 250;

comment on column public.category_cost_defaults.weight_grams_per_piece is
  'Peso médio de uma peça desta categoria em gramas (frete Correios).';
