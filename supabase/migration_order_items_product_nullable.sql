-- Permite remover produtos do catálogo quando somem do Drive, mantendo linhas de pedido
-- (snapshots já estão em order_items). product_id fica NULL nesses casos.

alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;

alter table public.order_items
  alter column product_id drop not null;

alter table public.order_items
  add constraint order_items_product_id_fkey
    foreign key (product_id) references public.products (id)
    on delete set null;
