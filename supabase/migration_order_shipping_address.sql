-- Endereço estruturado do destinatário (varejo / etiqueta SuperFrete).
-- O checkout também grava um resumo legível em orders.customer_note.
alter table public.orders
  add column if not exists shipping_address jsonb;

comment on column public.orders.shipping_address is
  'Destinatário para etiqueta: { cpf, street, number, complement?, district, city, state, postal_code }';
