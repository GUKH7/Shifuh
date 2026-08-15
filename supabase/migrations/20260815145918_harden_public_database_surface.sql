create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to anon, authenticated, service_role;

create or replace function app_private.get_public_restaurants()
returns table (
  id uuid,
  name text,
  slug text,
  phone text,
  logo_url text,
  image_url text,
  description text,
  primary_color text,
  address_street text,
  address_number text,
  address_neighborhood text,
  address_city text,
  address_state text,
  work_hours jsonb,
  delivery_tiers jsonb,
  banners text[],
  storefront_headline text,
  storefront_subheadline text,
  storefront_theme jsonb,
  minimum_order_amount numeric,
  scheduled_orders_enabled boolean,
  scheduled_order_lead_minutes integer,
  pickup_enabled boolean,
  rating_average numeric,
  rating_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
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
  from public.restaurants r;
$$;

revoke all on function app_private.get_public_restaurants() from public, anon, authenticated, service_role;
grant execute on function app_private.get_public_restaurants() to anon, authenticated, service_role;

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
    (r.sold_quantity > 0 and r.sales_rank = 1) as is_best_seller
  from public.products p
  join ranked_products r on r.id = p.id;
$$;

revoke all on function app_private.get_public_storefront_products() from public, anon, authenticated, service_role;
grant execute on function app_private.get_public_storefront_products() to anon, authenticated, service_role;

drop view if exists public.public_restaurants;
create view public.public_restaurants
with (security_invoker = true, security_barrier = true)
as
select * from app_private.get_public_restaurants();

revoke all privileges on public.public_restaurants from public, anon, authenticated, service_role;
grant select on public.public_restaurants to anon, authenticated, service_role;

drop view if exists public.public_storefront_products;
create view public.public_storefront_products
with (security_invoker = true, security_barrier = true)
as
select * from app_private.get_public_storefront_products();

revoke all privileges on public.public_storefront_products from public, anon, authenticated, service_role;
grant select on public.public_storefront_products to anon, authenticated, service_role;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, public.profiles.name);

  insert into public.restaurants (user_id, name, slug)
  select
    new.id,
    'Minha Loja',
    'loja-' || substr(new.id::text, 1, 8)
  where not exists (
    select 1 from public.restaurants where user_id = new.id
  );

  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

drop function if exists public.handle_new_user();

create or replace function public.update_restaurant_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.restaurants
  set
    rating_average = (
      select avg(r.rating)
      from public.reviews r
      where r.restaurant_id = new.restaurant_id
    ),
    rating_count = (
      select count(*)
      from public.reviews r
      where r.restaurant_id = new.restaurant_id
    )
  where id = new.restaurant_id;
  return new;
end;
$$;

alter function public.set_updated_at() set search_path = '';
alter function public.touch_ifood_updated_at() set search_path = '';
