create or replace function app_private.get_public_storefront_products()
returns table (
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
    (r.sold_quantity >= 3 and r.sales_rank = 1) as is_best_seller
  from public.products p
  join ranked_products r on r.id = p.id;
$$;
