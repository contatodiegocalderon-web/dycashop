-- Peso unitário em gramas para produtos manuais (KITs PRONTOS).

alter table public.products
  add column if not exists weight_grams integer;

alter table public.products
  drop constraint if exists products_weight_grams_check;

alter table public.products
  add constraint products_weight_grams_check
  check (weight_grams is null or weight_grams > 0);

comment on column public.products.weight_grams is
  'Peso unitário em gramas (kits e cadastros manuais); usado no frete.';
