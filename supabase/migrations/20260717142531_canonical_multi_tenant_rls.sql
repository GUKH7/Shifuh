-- Canonical multi-tenant RLS policies.
-- Explicit roles avoid evaluating ownership predicates for anonymous requests.

create index if not exists idx_restaurants_user_id on public.restaurants (user_id);
create index if not exists idx_ifood_category_links_restaurant on public.ifood_category_links (restaurant_id);
create index if not exists idx_ifood_product_links_restaurant on public.ifood_product_links (restaurant_id);

drop policy if exists "Owners can manage own restaurant" on public.restaurants;
create policy "Owners can manage own restaurant"
on public.restaurants for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories"
on public.categories for select to anon, authenticated
using (true);

drop policy if exists "Owners can manage own categories" on public.categories;
create policy "Owners can manage own categories"
on public.categories for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = categories.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = categories.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products for select to anon, authenticated
using (is_active = true);

drop policy if exists "Owners can manage own products" on public.products;
create policy "Owners can manage own products"
on public.products for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = products.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = products.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can read own customers" on public.customers;
create policy "Owners can read own customers"
on public.customers for select to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = customers.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update own customers" on public.customers;
create policy "Owners can update own customers"
on public.customers for update to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = customers.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = customers.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can read own orders" on public.orders;
create policy "Owners can read own orders"
on public.orders for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.restaurants r
    where r.id = orders.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can update own orders" on public.orders;
create policy "Owners can update own orders"
on public.orders for update to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = orders.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = orders.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can read own order items" on public.order_items;
create policy "Owners can read own order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.restaurants r on r.id = o.restaurant_id
    where o.id = order_items.order_id
      and (r.user_id = (select auth.uid()) or o.user_id = (select auth.uid()))
  )
);

drop policy if exists "Users can manage own profile" on public.profiles;
create policy "Users can manage own profile"
on public.profiles for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can manage own addresses" on public.customer_addresses;
create policy "Users can manage own addresses"
on public.customer_addresses for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can manage own coupons" on public.coupons;
create policy "Owners can manage own coupons"
on public.coupons for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = coupons.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = coupons.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can read own reviews" on public.reviews;
create policy "Owners can read own reviews"
on public.reviews for select to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = reviews.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Customers can create reviews" on public.reviews;
create policy "Customers can create reviews"
on public.reviews for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.orders o
    where o.id = reviews.order_id
      and o.user_id = (select auth.uid())
      and o.restaurant_id = reviews.restaurant_id
  )
);

drop policy if exists "Customers can read own reviews" on public.reviews;
create policy "Customers can read own reviews"
on public.reviews for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "ifood integrations owner access" on public.ifood_integrations;
create policy "ifood integrations owner access"
on public.ifood_integrations for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_integrations.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_integrations.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "ifood category links owner access" on public.ifood_category_links;
create policy "ifood category links owner access"
on public.ifood_category_links for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_category_links.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_category_links.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "ifood product links owner access" on public.ifood_product_links;
create policy "ifood product links owner access"
on public.ifood_product_links for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_product_links.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_product_links.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can manage own ifood order events" on public.ifood_order_events;
create policy "Owners can manage own ifood order events"
on public.ifood_order_events for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_order_events.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_order_events.restaurant_id
      and r.user_id = (select auth.uid())
  )
);

drop policy if exists "Owners can manage own ifood sync runs" on public.ifood_sync_runs;
create policy "Owners can manage own ifood sync runs"
on public.ifood_sync_runs for all to authenticated
using (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_sync_runs.restaurant_id
      and r.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.restaurants r
    where r.id = ifood_sync_runs.restaurant_id
      and r.user_id = (select auth.uid())
  )
);
