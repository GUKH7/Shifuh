-- Gestor Delivery - modulos CRM e crescimento
-- Cria estruturas base para profiles, customer_addresses, coupons e reviews.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  label TEXT DEFAULT 'Endereço',
  cep TEXT,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  complement TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  value NUMERIC(10, 2) NOT NULL CHECK (value >= 0),
  discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  usage_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, code)
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  user_id UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant_id ON public.coupons (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON public.coupons (active);
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_id ON public.reviews (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id ON public.reviews (order_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage own addresses" ON public.customer_addresses;
DROP POLICY IF EXISTS "Owners can manage own coupons" ON public.coupons;
DROP POLICY IF EXISTS "Owners can read own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers can create reviews" ON public.reviews;

CREATE POLICY "Users can manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own addresses"
  ON public.customer_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can manage own coupons"
  ON public.coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = coupons.restaurant_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = coupons.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can read own reviews"
  ON public.reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = reviews.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Customers can create reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (true);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS customer_addresses_updated_at ON public.customer_addresses;
DROP TRIGGER IF EXISTS coupons_updated_at ON public.coupons;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
