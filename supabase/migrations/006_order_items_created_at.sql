-- Gestor Delivery - alinhamento final de order_items.created_at

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
