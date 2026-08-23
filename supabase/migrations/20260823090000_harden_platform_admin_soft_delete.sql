-- Harden platform-admin soft delete so archived restaurants are blocked at the database boundary.
-- Historical customer-owned records remain readable by their owners, while restaurant-member operations stop.

create or replace function app_private.is_restaurant_active(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurants r
    where r.id = p_restaurant_id
      and r.deleted_at is null
  );
$$;

create or replace function app_private.is_active_restaurant_member(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    join public.restaurants r on r.id = rm.restaurant_id
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = (select auth.uid())
      and r.deleted_at is null
  );
$$;

create or replace function app_private.is_active_restaurant_member_text(p_restaurant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    join public.restaurants r on r.id = rm.restaurant_id
    where rm.restaurant_id::text = p_restaurant_id
      and rm.user_id = (select auth.uid())
      and r.deleted_at is null
  );
$$;

revoke all on function app_private.is_restaurant_active(uuid) from public;
revoke all on function app_private.is_active_restaurant_member(uuid) from public;
revoke all on function app_private.is_active_restaurant_member_text(text) from public;
grant execute on function app_private.is_restaurant_active(uuid) to anon, authenticated, service_role;
grant execute on function app_private.is_active_restaurant_member(uuid) to authenticated, service_role;
grant execute on function app_private.is_active_restaurant_member_text(text) to authenticated, service_role;

-- Public catalog data is visible only while its restaurant is active.
drop policy if exists "Public can read categories" on public.categories;
create policy "Public can read categories"
on public.categories
for select
to anon, authenticated
using (app_private.is_restaurant_active(categories.restaurant_id));

drop policy if exists "Members can manage restaurant categories" on public.categories;
drop policy if exists "Members can insert restaurant categories" on public.categories;
drop policy if exists "Members can update restaurant categories" on public.categories;
drop policy if exists "Members can delete restaurant categories" on public.categories;
create policy "Members can insert restaurant categories"
on public.categories for insert to authenticated
with check (app_private.is_active_restaurant_member(categories.restaurant_id));
create policy "Members can update restaurant categories"
on public.categories for update to authenticated
using (app_private.is_active_restaurant_member(categories.restaurant_id))
with check (app_private.is_active_restaurant_member(categories.restaurant_id));
create policy "Members can delete restaurant categories"
on public.categories for delete to authenticated
using (app_private.is_active_restaurant_member(categories.restaurant_id));

drop policy if exists "Anon can read active products" on public.products;
drop policy if exists "Authenticated can read accessible products" on public.products;
drop policy if exists "Members can manage restaurant products" on public.products;
drop policy if exists "Members can insert restaurant products" on public.products;
drop policy if exists "Members can update restaurant products" on public.products;
drop policy if exists "Members can delete restaurant products" on public.products;
create policy "Anon can read active products"
on public.products for select to anon
using (
  is_active = true
  and app_private.is_restaurant_active(products.restaurant_id)
);
create policy "Authenticated can read accessible products"
on public.products for select to authenticated
using (
  app_private.is_restaurant_active(products.restaurant_id)
  and (
    is_active = true
    or app_private.is_active_restaurant_member(products.restaurant_id)
  )
);
create policy "Members can insert restaurant products"
on public.products for insert to authenticated
with check (app_private.is_active_restaurant_member(products.restaurant_id));
create policy "Members can update restaurant products"
on public.products for update to authenticated
using (app_private.is_active_restaurant_member(products.restaurant_id))
with check (app_private.is_active_restaurant_member(products.restaurant_id));
create policy "Members can delete restaurant products"
on public.products for delete to authenticated
using (app_private.is_active_restaurant_member(products.restaurant_id));

-- Private tenant tables deny archived restaurant members.
drop policy if exists "Members can manage restaurant coupons" on public.coupons;
create policy "Members can manage restaurant coupons"
on public.coupons for all to authenticated
using (app_private.is_active_restaurant_member(coupons.restaurant_id))
with check (app_private.is_active_restaurant_member(coupons.restaurant_id));

drop policy if exists "Members can read restaurant customers" on public.customers;
drop policy if exists "Members can update restaurant customers" on public.customers;
create policy "Members can read restaurant customers"
on public.customers for select to authenticated
using (app_private.is_active_restaurant_member(customers.restaurant_id));
create policy "Members can update restaurant customers"
on public.customers for update to authenticated
using (app_private.is_active_restaurant_member(customers.restaurant_id))
with check (app_private.is_active_restaurant_member(customers.restaurant_id));

drop policy if exists "Members can read restaurant orders" on public.orders;
drop policy if exists "Members can update restaurant orders" on public.orders;
create policy "Members can read restaurant orders"
on public.orders for select to authenticated
using (
  user_id = (select auth.uid())
  or app_private.is_active_restaurant_member(orders.restaurant_id)
);
create policy "Members can update restaurant orders"
on public.orders for update to authenticated
using (app_private.is_active_restaurant_member(orders.restaurant_id))
with check (app_private.is_active_restaurant_member(orders.restaurant_id));

drop policy if exists "Members can read restaurant order items" on public.order_items;
create policy "Members can read restaurant order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (
        o.user_id = (select auth.uid())
        or app_private.is_active_restaurant_member(o.restaurant_id)
      )
  )
);

drop policy if exists "Members can read restaurant reviews" on public.reviews;
drop policy if exists "Authenticated can read accessible reviews" on public.reviews;
create policy "Authenticated can read accessible reviews"
on public.reviews for select to authenticated
using (
  user_id = (select auth.uid())
  or app_private.is_active_restaurant_member(reviews.restaurant_id)
);

drop policy if exists "Customers can create reviews" on public.reviews;
create policy "Customers can create reviews"
on public.reviews for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and app_private.is_restaurant_active(reviews.restaurant_id)
  and exists (
    select 1
    from public.orders o
    where o.id = reviews.order_id
      and o.user_id = (select auth.uid())
      and o.restaurant_id = reviews.restaurant_id
  )
);

drop policy if exists "Restaurant members can read checkout events" on public.storefront_checkout_events;
create policy "Restaurant members can read checkout events"
on public.storefront_checkout_events for select to authenticated
using (app_private.is_active_restaurant_member(storefront_checkout_events.restaurant_id));

drop policy if exists "Members can read own restaurant subscription" on public.restaurant_subscriptions;
create policy "Members can read own restaurant subscription"
on public.restaurant_subscriptions for select to authenticated
using (app_private.is_active_restaurant_member(restaurant_subscriptions.restaurant_id));

-- Integration access is also disabled while the tenant is archived.
drop policy if exists "ifood category links member access" on public.ifood_category_links;
create policy "ifood category links member access"
on public.ifood_category_links for all to authenticated
using (app_private.is_active_restaurant_member(ifood_category_links.restaurant_id))
with check (app_private.is_active_restaurant_member(ifood_category_links.restaurant_id));

drop policy if exists "ifood integrations member access" on public.ifood_integrations;
create policy "ifood integrations member access"
on public.ifood_integrations for all to authenticated
using (app_private.is_active_restaurant_member(ifood_integrations.restaurant_id))
with check (app_private.is_active_restaurant_member(ifood_integrations.restaurant_id));

drop policy if exists "Members can manage restaurant ifood order events" on public.ifood_order_events;
create policy "Members can manage restaurant ifood order events"
on public.ifood_order_events for all to authenticated
using (app_private.is_active_restaurant_member(ifood_order_events.restaurant_id))
with check (app_private.is_active_restaurant_member(ifood_order_events.restaurant_id));

drop policy if exists "ifood product links member access" on public.ifood_product_links;
create policy "ifood product links member access"
on public.ifood_product_links for all to authenticated
using (app_private.is_active_restaurant_member(ifood_product_links.restaurant_id))
with check (app_private.is_active_restaurant_member(ifood_product_links.restaurant_id));

drop policy if exists "Members can manage restaurant ifood sync runs" on public.ifood_sync_runs;
create policy "Members can manage restaurant ifood sync runs"
on public.ifood_sync_runs for all to authenticated
using (app_private.is_active_restaurant_member(ifood_sync_runs.restaurant_id))
with check (app_private.is_active_restaurant_member(ifood_sync_runs.restaurant_id));

-- Archived members cannot mutate restaurant-scoped storage objects.
drop policy if exists "Gestor Delivery restaurant image insert" on storage.objects;
drop policy if exists "Gestor Delivery restaurant image update" on storage.objects;
drop policy if exists "Gestor Delivery restaurant image delete" on storage.objects;
create policy "Gestor Delivery restaurant image insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and app_private.is_active_restaurant_member_text((storage.foldername(objects.name))[1])
);
create policy "Gestor Delivery restaurant image update"
on storage.objects for update to authenticated
using (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and app_private.is_active_restaurant_member_text((storage.foldername(objects.name))[1])
)
with check (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and app_private.is_active_restaurant_member_text((storage.foldername(objects.name))[1])
);
create policy "Gestor Delivery restaurant image delete"
on storage.objects for delete to authenticated
using (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and app_private.is_active_restaurant_member_text((storage.foldername(objects.name))[1])
);

-- Public storefront product view must not bypass soft delete through SECURITY DEFINER.
create or replace function app_private.get_public_storefront_products()
returns table(
  id uuid,
  restaurant_id uuid,
  category_id uuid,
  name text,
  description text,
  price numeric,
  image_url text,
  is_active boolean,
  addons jsonb,
  is_promotional boolean,
  is_vegetarian boolean,
  is_best_seller boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with product_sales as (
    select
      o.restaurant_id,
      lower(trim(oi.product_name)) as product_name_key,
      sum(oi.quantity)::bigint as sold_quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where coalesce(o.is_test, false) = false
      and o.status not in ('cancelled', 'canceled')
    group by o.restaurant_id, lower(trim(oi.product_name))
  ), ranked_products as (
    select
      p.id,
      p.restaurant_id,
      coalesce(ps.sold_quantity, 0)::bigint as sold_quantity,
      dense_rank() over (
        partition by p.restaurant_id
        order by coalesce(ps.sold_quantity, 0) desc
      ) as sales_rank
    from public.products p
    left join product_sales ps
      on ps.restaurant_id = p.restaurant_id
      and ps.product_name_key = lower(trim(p.name))
  )
  select
    p.id,
    p.restaurant_id,
    p.category_id,
    p.name,
    p.description,
    p.price,
    p.image_url,
    p.is_active,
    p.addons,
    p.is_promotional,
    p.is_vegetarian,
    (rp.sold_quantity >= 3 and rp.sales_rank = 1) as is_best_seller
  from public.products p
  join ranked_products rp on rp.id = p.id
  join public.restaurants r
    on r.id = p.restaurant_id
   and r.deleted_at is null;
$$;

-- Default-store selection cannot target an archived tenant.
create or replace function public.set_default_restaurant(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.restaurant_members rm
    join public.restaurants r on r.id = rm.restaurant_id
    where rm.user_id = v_user_id
      and rm.restaurant_id = p_restaurant_id
      and r.deleted_at is null
  ) then
    raise exception using errcode = '42501', message = 'User is not a member of an active restaurant';
  end if;

  update public.restaurant_members
  set is_default = false
  where user_id = v_user_id
    and is_default;

  update public.restaurant_members
  set is_default = true
  where user_id = v_user_id
    and restaurant_id = p_restaurant_id;
end;
$$;

revoke all on function public.set_default_restaurant(uuid) from public, anon;
grant execute on function public.set_default_restaurant(uuid) to authenticated;

-- Platform-member changes are serialized and audited in one database transaction.
create or replace function public.update_platform_member_admin(
  p_user_id uuid,
  p_role text default null,
  p_is_active boolean default null,
  p_actor_user_id uuid default null,
  p_actor_role text default null
)
returns table(status text, role text, is_active boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_role text;
  v_current_active boolean;
  v_next_role text;
  v_next_active boolean;
  v_active_owner_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-members:last-owner', 0)
  );

  select pm.role, pm.is_active
    into v_current_role, v_current_active
  from public.platform_members pm
  where pm.user_id = p_user_id
  for update;

  if not found then
    return query select 'not_found'::text, null::text, null::boolean;
    return;
  end if;

  v_next_role := coalesce(p_role, v_current_role);
  v_next_active := coalesce(p_is_active, v_current_active);

  if v_next_role not in ('owner', 'admin', 'support', 'viewer') then
    raise exception using errcode = '22023', message = 'Invalid platform role';
  end if;

  if p_actor_role not in ('owner', 'admin', 'support', 'viewer') then
    raise exception using errcode = '22023', message = 'Invalid platform actor role';
  end if;

  if v_current_role = 'owner'
    and v_current_active
    and (v_next_role <> 'owner' or not v_next_active)
  then
    select count(*)
      into v_active_owner_count
    from public.platform_members pm
    where pm.role = 'owner'
      and pm.is_active;

    if v_active_owner_count <= 1 then
      return query select 'last_owner'::text, v_current_role, v_current_active;
      return;
    end if;
  end if;

  update public.platform_members
  set role = v_next_role,
      is_active = v_next_active,
      updated_at = now()
  where user_id = p_user_id;

  insert into public.platform_audit_log (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_actor_user_id,
    p_actor_role,
    'platform_member.update',
    'platform_member',
    p_user_id::text,
    pg_catalog.jsonb_build_object(
      'before', pg_catalog.jsonb_build_object('role', v_current_role, 'is_active', v_current_active),
      'after', pg_catalog.jsonb_build_object('role', v_next_role, 'is_active', v_next_active)
    )
  );

  return query select 'updated'::text, v_next_role, v_next_active;
end;
$$;

revoke all on function public.update_platform_member_admin(uuid, text, boolean, uuid, text) from public, anon, authenticated;
grant execute on function public.update_platform_member_admin(uuid, text, boolean, uuid, text) to service_role;

-- First-owner bootstrap is one-shot, serialized and audited atomically.
create or replace function public.bootstrap_platform_owner_admin(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-members:bootstrap-owner', 0)
  );

  if exists (
    select 1
    from public.platform_members pm
    where pm.role = 'owner'
      and pm.is_active
  ) then
    return 'already_initialized';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    return 'user_not_found';
  end if;

  insert into public.platform_members (
    user_id,
    role,
    is_active,
    created_by,
    created_at,
    updated_at
  ) values (
    p_user_id,
    'owner',
    true,
    p_user_id,
    now(),
    now()
  )
  on conflict (user_id) do update set
    role = 'owner',
    is_active = true,
    updated_at = now();

  insert into public.platform_audit_log (
    actor_user_id,
    actor_role,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    p_user_id,
    'owner',
    'platform_owner.bootstrap',
    'platform_member',
    p_user_id::text,
    pg_catalog.jsonb_build_object('provisioned_by', 'bootstrap-script')
  );

  return 'created';
end;
$$;

revoke all on function public.bootstrap_platform_owner_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_platform_owner_admin(uuid) to service_role;
