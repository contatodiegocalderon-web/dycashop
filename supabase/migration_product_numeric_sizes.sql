-- Calça e tênis usam numeração (38, 40, 42…), não só M/G/GG.
alter table public.products drop constraint if exists products_size_check;
