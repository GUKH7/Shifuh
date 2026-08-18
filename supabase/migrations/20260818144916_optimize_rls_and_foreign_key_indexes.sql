-- Cover foreign keys used by deletes, joins and RLS-related lookups.
create index if not exists customer_addresses_user_id_idx
  on public.customer_addresses (user_id);

create index if not exists ifood_order_events_local_order_id_idx
  on public.ifood_order_events (local_order_id);

create index if not exists reviews_restaurant_id_idx
  on public.reviews (restaurant_id);

create index if not exists reviews_user_id_idx
  on public.reviews (user_id);

-- restaurants.slug is already protected by restaurants_slug_key.
-- Keep the constraint-backed index and remove the redundant standalone copy.
drop index if exists public.idx_restaurants_slug;

-- categories: preserve the existing public SELECT behavior, but keep member
-- write permissions out of SELECT so authenticated requests evaluate one
-- permissive SELECT policy instead of two.
drop policy if exists "Members can manage restaurant categories" on public.categories;

create policy "Members can insert restaurant categories"
  on public.categories
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = categories.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

create policy "Members can update restaurant categories"
  on public.categories
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = categories.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = categories.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

create policy "Members can delete restaurant categories"
  on public.categories
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = categories.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

-- products: anon keeps active-only access. Authenticated users get a single
-- SELECT policy that is equivalent to the previous union of public + member
-- policies: active products are public, inactive products require membership.
drop policy if exists "Members can manage restaurant products" on public.products;
drop policy if exists "Public can read active products" on public.products;

create policy "Anon can read active products"
  on public.products
  for select
  to anon
  using (is_active = true);

create policy "Authenticated can read accessible products"
  on public.products
  for select
  to authenticated
  using (
    is_active = true
    or exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = products.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

create policy "Members can insert restaurant products"
  on public.products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = products.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

create policy "Members can update restaurant products"
  on public.products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = products.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = products.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

create policy "Members can delete restaurant products"
  on public.products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = products.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );

-- reviews: collapse the two authenticated SELECT policies into one equivalent
-- OR expression so each row evaluates one permissive SELECT policy.
drop policy if exists "Customers can read own reviews" on public.reviews;
drop policy if exists "Members can read restaurant reviews" on public.reviews;

create policy "Authenticated can read accessible reviews"
  on public.reviews
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = reviews.restaurant_id
        and rm.user_id = (select auth.uid())
    )
  );
