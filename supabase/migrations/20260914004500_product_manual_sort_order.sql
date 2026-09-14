-- Persist manual product ordering per category and expose it consistently to the storefront.

alter table public.products
  add column if not exists sort_order integer;

with ranked_products as (
  select
    p.id,
    row_number() over (
      partition by p.restaurant_id, p.category_id
      order by p.created_at asc nulls last, p.id asc
    )::integer as position
  from public.products p
)
update public.products p
set sort_order = ranked_products.position
from ranked_products
where ranked_products.id = p.id
  and p.sort_order is null;

create or replace function app_private.assign_product_sort_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sort_order is null or new.sort_order <= 0 then
      select coalesce(max(p.sort_order), 0) + 1
      into new.sort_order
      from public.products p
      where p.restaurant_id = new.restaurant_id
        and p.category_id = new.category_id;
    end if;
  elsif tg_op = 'UPDATE' and new.category_id is distinct from old.category_id then
    if new.sort_order is null or new.sort_order = old.sort_order or new.sort_order <= 0 then
      select coalesce(max(p.sort_order), 0) + 1
      into new.sort_order
      from public.products p
      where p.restaurant_id = new.restaurant_id
        and p.category_id = new.category_id
        and p.id <> new.id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.assign_product_sort_order()
from public, anon, authenticated, service_role;

drop trigger if exists products_assign_sort_order on public.products;
create trigger products_assign_sort_order
before insert or update of category_id, sort_order
on public.products
for each row
execute function app_private.assign_product_sort_order();

alter table public.products
  alter column sort_order set not null;

alter table public.products
  drop constraint if exists products_sort_order_positive;
alter table public.products
  add constraint products_sort_order_positive check (sort_order > 0);

create index if not exists products_restaurant_category_sort_idx
  on public.products (restaurant_id, category_id, sort_order, created_at, id);

create or replace function public.reorder_products(
  p_category_id uuid,
  p_product_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_expected_count integer;
  v_received_count integer;
begin
  select c.restaurant_id
  into v_restaurant_id
  from public.categories c
  where c.id = p_category_id;

  if v_restaurant_id is null then
    raise exception using errcode = 'P0002', message = 'Category not found';
  end if;

  if not exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = v_restaurant_id
      and rm.user_id = auth.uid()
  ) and not exists (
    select 1
    from public.restaurants r
    where r.id = v_restaurant_id
      and r.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Not authorized to reorder products for this restaurant';
  end if;

  select count(*)::integer
  into v_expected_count
  from public.products p
  where p.restaurant_id = v_restaurant_id
    and p.category_id = p_category_id;

  v_received_count := coalesce(array_length(p_product_ids, 1), 0);

  if v_received_count <> v_expected_count then
    raise exception using
      errcode = '22023',
      message = 'Product order must contain every product in the category exactly once';
  end if;

  if (
    select count(distinct product_id)::integer
    from unnest(p_product_ids) as product_id
  ) <> v_received_count then
    raise exception using errcode = '22023', message = 'Product order contains duplicate products';
  end if;

  if exists (
    select 1
    from unnest(p_product_ids) as requested(product_id)
    left join public.products p
      on p.id = requested.product_id
      and p.restaurant_id = v_restaurant_id
      and p.category_id = p_category_id
    where p.id is null
  ) then
    raise exception using errcode = '22023', message = 'Product order contains an invalid product';
  end if;

  update public.products p
  set sort_order = requested.ordinality::integer
  from unnest(p_product_ids) with ordinality as requested(product_id, ordinality)
  where p.id = requested.product_id
    and p.restaurant_id = v_restaurant_id
    and p.category_id = p_category_id;
end;
$$;

revoke all on function public.reorder_products(uuid, uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.reorder_products(uuid, uuid[])
to authenticated, service_role;

-- Recreate the public storefront product surface with the manual position included.
drop view if exists public.public_storefront_products;
drop function if exists app_private.get_public_storefront_products();

create function app_private.get_public_storefront_products()
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
  sort_order integer,
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
    p.sort_order,
    (r.sold_quantity >= 3 and r.sales_rank = 1) as is_best_seller
  from public.products p
  join ranked_products r on r.id = p.id
  order by p.category_id, p.sort_order, p.created_at, p.id;
$$;

revoke all on function app_private.get_public_storefront_products()
from public, anon, authenticated, service_role;
grant execute on function app_private.get_public_storefront_products()
to anon, authenticated, service_role;

create view public.public_storefront_products
with (security_invoker = true, security_barrier = true)
as
select * from app_private.get_public_storefront_products();

revoke all privileges on public.public_storefront_products
from public, anon, authenticated, service_role;
grant select on public.public_storefront_products
to anon, authenticated, service_role;

-- Keep the latency-optimized storefront bundle in the same manual order.
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
      p.sort_order,
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
      rp.sort_order,
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
        (
          select jsonb_agg(to_jsonb(p) order by c."order", p.sort_order, p.id)
          from public_products p
          join public_categories c on c.id = p.category_id
        ),
        '[]'::jsonb
      )
    )
  end;
$$;

revoke all on function app_private.get_public_storefront_bundle(text)
from public, anon, authenticated, service_role;
grant execute on function app_private.get_public_storefront_bundle(text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
