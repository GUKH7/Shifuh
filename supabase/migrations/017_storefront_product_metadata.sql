alter table public.products
  add column if not exists is_promotional boolean not null default false,
  add column if not exists is_vegetarian boolean not null default false;

drop view if exists public.public_storefront_products;

create view public.public_storefront_products
with (security_barrier = true)
as
with product_sales as (
  select o.restaurant_id, lower(trim(oi.product_name)) as product_name_key,
    sum(oi.quantity)::bigint as sold_quantity
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where coalesce(o.is_test, false) = false
    and o.status not in ('cancelled', 'canceled')
  group by o.restaurant_id, lower(trim(oi.product_name))
), ranked_products as (
  select p.id, p.restaurant_id, p.category_id, p.name, p.description, p.price,
    p.image_url, p.is_active, p.addons, p.is_promotional, p.is_vegetarian,
    coalesce(ps.sold_quantity, 0)::bigint as sold_quantity,
    dense_rank() over (partition by p.restaurant_id order by coalesce(ps.sold_quantity, 0) desc) as sales_rank
  from public.products p
  left join product_sales ps on ps.restaurant_id = p.restaurant_id
    and ps.product_name_key = lower(trim(p.name))
)
select id, restaurant_id, category_id, name, description, price, image_url,
  is_active, addons, is_promotional, is_vegetarian, sold_quantity,
  sold_quantity > 0 and sales_rank = 1 as is_best_seller
from ranked_products;

revoke all on public.public_storefront_products from public;
grant select on public.public_storefront_products to anon, authenticated;
