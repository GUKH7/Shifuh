-- Shifuh - regras de review e cupom

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_order_unique
  ON public.reviews (order_id);

DROP POLICY IF EXISTS "Customers can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers can read own reviews" ON public.reviews;

CREATE POLICY "Customers can create reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = reviews.order_id
        AND o.user_id = auth.uid()
        AND o.restaurant_id = reviews.restaurant_id
    )
  );

CREATE POLICY "Customers can read own reviews"
  ON public.reviews FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = reviews.order_id
        AND o.user_id = auth.uid()
    )
  );
