-- Shifuh - alinhamento defensivo de orders/order_items
-- Necessario para bancos onde a tabela orders ja existia antes da migration 002.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS change_for TEXT,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS observation TEXT,
  ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON public.orders (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
