-- Se a tabela products já existir sem a coluna category, executar no SQL Editor:
alter table public.products add column if not exists category text;
create index if not exists products_category_idx on public.products (category) where category is not null;
