-- Número de vitrine fixo por pedido (não recalcula ao cancelar / ao mudar a lista filtrada).
-- Execute no SQL Editor do Supabase após deploy do código que lê esta coluna.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS display_number integer;

UPDATE public.orders o
SET display_number = r.n
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS n
  FROM public.orders
  WHERE display_number IS NULL
) r
WHERE o.id = r.id;

CREATE SEQUENCE IF NOT EXISTS public.orders_display_number_seq;

SELECT setval(
  'public.orders_display_number_seq',
  COALESCE((SELECT MAX(display_number) FROM public.orders), 0),
  true
);

ALTER TABLE public.orders
  ALTER COLUMN display_number SET DEFAULT nextval('public.orders_display_number_seq');

ALTER SEQUENCE public.orders_display_number_seq OWNED BY public.orders.display_number;

ALTER TABLE public.orders
  ALTER COLUMN display_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_display_number_uidx ON public.orders (display_number);
