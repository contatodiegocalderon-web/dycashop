-- Aviso em pedidos pendentes quando outro pedido confirmado esgota a mesma peça.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_conflict jsonb;
