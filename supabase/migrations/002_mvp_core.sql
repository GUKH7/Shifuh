-- Gestor Delivery - core MVP schema alignment
-- Expande o schema inicial para compatibilizar onboarding, cardapio, configuracoes e pedidos.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#DC2626',
  ADD COLUMN IF NOT EXISTS address_zip TEXT,
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_number TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS address_city TEXT,
  ADD COLUMN IF NOT EXISTS address_state TEXT,
  ADD COLUMN IF NOT EXISTS delivery_tiers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_hours JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS printer_width INTEGER DEFAULT 80,
  ADD COLUMN IF NOT EXISTS printer_font_size INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS banners JSONB DEFAULT '[]'::jsonb;

UPDATE public.restaurants
SET phone = COALESCE(phone, whatsapp_number),
    primary_color = COALESCE(primary_color, color_theme)
WHERE phone IS NULL OR primary_color IS NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  user_id UUID,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address JSONB,
  subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'delivering', 'done', 'canceled')),
  payment_method TEXT NOT NULL DEFAULT 'pix',
  change_for TEXT,
  coupon_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON public.orders (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  observation TEXT,
  addons JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Customers are viewable by everyone for now" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customer for a restaurant" ON public.customers;

CREATE POLICY "Public can read restaurants"
  ON public.restaurants FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage own restaurant"
  ON public.restaurants FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can read categories"
  ON public.categories FOR SELECT
  USING (true);

CREATE POLICY "Owners can manage own categories"
  ON public.categories FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can read active products"
  ON public.products FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Owners can manage own products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can read own orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "Owners can update own orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can create order items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_id
    )
  );

CREATE POLICY "Owners can read own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_id AND (r.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
