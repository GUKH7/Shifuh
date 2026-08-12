-- Shifuh - limpeza e consolidacao das politicas RLS do nucleo
-- Remove policies antigas/duplicadas e recria um conjunto canonico para o MVP.

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin pode ver seu proprio restaurante" ON public.restaurants;
DROP POLICY IF EXISTS "Admin_Full_Access" ON public.restaurants;
DROP POLICY IF EXISTS "Dados da loja são públicos" ON public.restaurants;
DROP POLICY IF EXISTS "Dono pode editar loja" ON public.restaurants;
DROP POLICY IF EXISTS "Donos gerem o seu restaurante" ON public.restaurants;
DROP POLICY IF EXISTS "Lojista gere o próprio restaurante" ON public.restaurants;
DROP POLICY IF EXISTS "Lojista pode inserir seu restaurante" ON public.restaurants;
DROP POLICY IF EXISTS "Owners can manage own restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Permitir inserção pelo dono" ON public.restaurants;
DROP POLICY IF EXISTS "Public can read restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Public restaurants are viewable by everyone" ON public.restaurants;
DROP POLICY IF EXISTS "Public_Select" ON public.restaurants;
DROP POLICY IF EXISTS "Public_View" ON public.restaurants;
DROP POLICY IF EXISTS "Público pode ver os restaurantes" ON public.restaurants;
DROP POLICY IF EXISTS "Restaurantes publicos" ON public.restaurants;
DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;

DROP POLICY IF EXISTS "Categorias publicas" ON public.categories;
DROP POLICY IF EXISTS "Donos gerem as suas categorias" ON public.categories;
DROP POLICY IF EXISTS "Lojista gere as suas categorias" ON public.categories;
DROP POLICY IF EXISTS "Owners can manage own categories" ON public.categories;
DROP POLICY IF EXISTS "Permitir tudo" ON public.categories;
DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
DROP POLICY IF EXISTS "Público pode ver as categorias" ON public.categories;
DROP POLICY IF EXISTS "Categories are viewable by everyone" ON public.categories;

DROP POLICY IF EXISTS "Apagar Produtos" ON public.products;
DROP POLICY IF EXISTS "Criar Produtos" ON public.products;
DROP POLICY IF EXISTS "Donos gerem os seus produtos" ON public.products;
DROP POLICY IF EXISTS "Editar Produtos" ON public.products;
DROP POLICY IF EXISTS "Lojista gere os seus produtos" ON public.products;
DROP POLICY IF EXISTS "Owners can manage own products" ON public.products;
DROP POLICY IF EXISTS "Produtos publicos" ON public.products;
DROP POLICY IF EXISTS "Public can read active products" ON public.products;
DROP POLICY IF EXISTS "Público pode ver os produtos" ON public.products;
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Ver Produtos" ON public.products;

DROP POLICY IF EXISTS "Customers are viewable by everyone for now" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customer for a restaurant" ON public.customers;
DROP POLICY IF EXISTS "Donos podem ver seus clientes" ON public.customers;
DROP POLICY IF EXISTS "Lojista gere seus clientes" ON public.customers;

DROP POLICY IF EXISTS "Donos atualizam os seus pedidos" ON public.orders;
DROP POLICY IF EXISTS "Donos veem os seus pedidos" ON public.orders;
DROP POLICY IF EXISTS "Lojista gere os pedidos da sua loja" ON public.orders;
DROP POLICY IF EXISTS "Owners can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Owners can update own orders" ON public.orders;
DROP POLICY IF EXISTS "Public can create orders" ON public.orders;
DROP POLICY IF EXISTS "Público pode criar pedidos" ON public.orders;
DROP POLICY IF EXISTS "Qualquer um pode criar pedido" ON public.orders;

DROP POLICY IF EXISTS "Donos veem os itens do pedido" ON public.order_items;
DROP POLICY IF EXISTS "Owners can read own order items" ON public.order_items;
DROP POLICY IF EXISTS "Public can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Qualquer um pode criar itens do pedido" ON public.order_items;

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
      WHERE r.id = categories.restaurant_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = categories.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can read active products"
  ON public.products FOR SELECT
  USING (is_active = true);

CREATE POLICY "Owners can manage own products"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = products.restaurant_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = products.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can read own customers"
  ON public.customers FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = customers.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update own customers"
  ON public.customers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = customers.restaurant_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = customers.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can create customers"
  ON public.customers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Owners can read own orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = orders.restaurant_id
        AND r.user_id = auth.uid()
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "Owners can update own orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = orders.restaurant_id
        AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.restaurants r
      WHERE r.id = orders.restaurant_id
        AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Public can create order items"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
    )
  );

CREATE POLICY "Owners can read own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_items.order_id
        AND (r.user_id = auth.uid() OR o.user_id = auth.uid())
    )
  );
