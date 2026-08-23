-- Reduce latency-sensitive Data API round trips without widening the public data surface.
-- Public storefront reads are bundled behind a SECURITY INVOKER wrapper, while the
-- privileged admin context RPC remains service-role only.

create or replace function app_private.get_public_storefront_bundle(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with restaurant as (
    select
      r.id,
      r.name,
      r.slug,
      r.phone,
      r.logo_url,
      r.image_url,
      r.description,
      r.primary_color,
      r.address_street,
      r.address_number,
      r.address_neighborhood,
      r.address_city,
      r.address_state,
      r.work_hours,
      r.delivery_tiers,
      r.banners,
      r.storefront_headline,
      r.storefront_subheadline,
      r.storefront_theme,
      r.minimum_order_amount,
      r.scheduled_orders_enabled,
      r.scheduled_order_lead_minutes,
      r.pickup_enabled,
      r.rating_average,
      r.rating_count
    from public.restaurants r
    where r.slug = lower(btrim(coalesce(p_slug, '')))
      and r.deleted_at is null
    limit 1
  ),
  product_sales as (
    select
      lower(btrim(oi.product_name)) as product_name_key,
      sum(oi.quantity)::bigint as sold_quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join restaurant r on r.id = o.restaurant_id
    where coalesce(o.is_test, false) = false
      and o.status not in ('cancelled', 'canceled')
    group by lower(btrim(oi.product_name))
  ),
  ranked_products as (
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
      coalesce(ps.sold_quantity, 0)::bigint as sold_quantity,
      dense_rank() over (
        order by coalesce(ps.sold_quantity, 0) desc
      ) as sales_rank
    from public.products p
    join restaurant r on r.id = p.restaurant_id
    left join product_sales ps
      on ps.product_name_key = lower(btrim(p.name))
  ),
  public_products as (
    select
      rp.id,
      rp.restaurant_id,
      rp.category_id,
      rp.name,
      rp.description,
      rp.price,
      rp.image_url,
      rp.is_active,
      rp.addons,
      rp.is_promotional,
      rp.is_vegetarian,
      (rp.sold_quantity >= 3 and rp.sales_rank = 1) as is_best_seller
    from ranked_products rp
  ),
  public_categories as (
    select
      c.id,
      c.restaurant_id,
      c.name,
      c."order",
      c.created_at,
      c.updated_at,
      c.is_active
    from public.categories c
    join restaurant r on r.id = c.restaurant_id
    where c.is_active = true
  )
  select case
    when not exists (select 1 from restaurant) then null
    else pg_catalog.jsonb_build_object(
      'restaurant', (select to_jsonb(r) from restaurant r),
      'categories', coalesce(
        (select jsonb_agg(to_jsonb(c) order by c."order") from public_categories c),
        '[]'::jsonb
      ),
      'products', coalesce(
        (select jsonb_agg(to_jsonb(p)) from public_products p),
        '[]'::jsonb
      )
    )
  end;
$$;

revoke all on function app_private.get_public_storefront_bundle(text)
  from public, anon, authenticated, service_role;
grant execute on function app_private.get_public_storefront_bundle(text)
  to anon, authenticated, service_role;

create or replace function public.get_public_storefront_bundle(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.get_public_storefront_bundle(p_slug);
$$;

revoke all on function public.get_public_storefront_bundle(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_storefront_bundle(text)
  to anon, authenticated, service_role;

create or replace function public.get_admin_navigation_context_admin(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'restaurant', (
      select pg_catalog.jsonb_build_object(
        'id', r.id,
        'slug', r.slug
      )
      from public.restaurant_members rm
      join public.restaurants r on r.id = rm.restaurant_id
      where rm.user_id = p_user_id
        and r.deleted_at is null
      order by rm.is_default desc, rm.created_at asc, rm.restaurant_id asc
      limit 1
    ),
    'platformAccess', (
      select case
        when pm.is_active then pg_catalog.jsonb_build_object('role', pm.role)
        else null
      end
      from public.platform_members pm
      where pm.user_id = p_user_id
      limit 1
    )
  );
$$;

revoke all on function public.get_admin_navigation_context_admin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_navigation_context_admin(uuid)
  to service_role;
