-- Operational safeguards for storefront orders.

alter table public.restaurants
  add column if not exists minimum_order_amount numeric(10, 2) not null default 0,
  add column if not exists scheduled_orders_enabled boolean not null default false,
  add column if not exists scheduled_order_lead_minutes integer not null default 60;

alter table public.orders
  add column if not exists scheduled_for timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_minimum_order_amount_nonnegative'
  ) then
    alter table public.restaurants
      add constraint restaurants_minimum_order_amount_nonnegative
      check (minimum_order_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_scheduled_order_lead_minutes_range'
  ) then
    alter table public.restaurants
      add constraint restaurants_scheduled_order_lead_minutes_range
      check (scheduled_order_lead_minutes between 30 and 10080);
  end if;
end;
$$;

drop view if exists public.public_restaurants;

create view public.public_restaurants
with (security_invoker = true, security_barrier = true)
as
select
  id,
  name,
  slug,
  phone,
  logo_url,
  image_url,
  color_theme,
  primary_color,
  latitude,
  longitude,
  storefront_headline,
  storefront_subheadline,
  storefront_theme,
  address_street,
  address_number,
  address_neighborhood,
  address_city,
  address_state,
  delivery_tiers,
  work_hours,
  banners,
  rating_average,
  rating_count,
  minimum_order_amount,
  scheduled_orders_enabled,
  scheduled_order_lead_minutes
from public.restaurants;

revoke all on public.public_restaurants from public;
grant select on public.public_restaurants to anon, authenticated;

create or replace function public.create_storefront_order_transaction(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address jsonb,
  p_items jsonb,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method text,
  p_change_for text,
  p_coupon_code text,
  p_user_id uuid,
  p_scheduled_for timestamptz,
  p_save_customer boolean
)
returns table(order_id uuid, display_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order record;
  restaurant_rules record;
begin
  select
    minimum_order_amount,
    scheduled_orders_enabled,
    scheduled_order_lead_minutes
  into restaurant_rules
  from public.restaurants
  where id = p_restaurant_id
  for share;

  if not found then
    raise exception 'restaurant is unavailable';
  end if;

  if round(coalesce(p_subtotal, 0)::numeric, 2) < restaurant_rules.minimum_order_amount then
    raise exception 'minimum order amount not reached';
  end if;

  if p_scheduled_for is not null and not restaurant_rules.scheduled_orders_enabled then
    raise exception 'scheduled orders are disabled';
  end if;

  if p_scheduled_for is not null
    and p_scheduled_for < now() + make_interval(mins => restaurant_rules.scheduled_order_lead_minutes) then
    raise exception 'scheduled order lead time not reached';
  end if;

  select * into created_order
  from public.create_order_transaction(
    p_restaurant_id => p_restaurant_id,
    p_customer_name => p_customer_name,
    p_customer_phone => p_customer_phone,
    p_address => p_address,
    p_items => p_items,
    p_subtotal => p_subtotal,
    p_delivery_fee => p_delivery_fee,
    p_discount => p_discount,
    p_total => p_total,
    p_payment_method => p_payment_method,
    p_change_for => p_change_for,
    p_coupon_code => p_coupon_code,
    p_user_id => p_user_id,
    p_status => 'pending',
    p_external_source => null,
    p_external_order_id => null,
    p_external_display_id => null,
    p_is_test => false,
    p_external_payload => null,
    p_save_customer => p_save_customer
  );

  update public.orders
  set scheduled_for = p_scheduled_for
  where id = created_order.order_id;

  order_id := created_order.order_id;
  display_number := created_order.display_number;
  return next;
end;
$$;

revoke all on function public.create_storefront_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric,
  text, text, text, uuid, timestamptz, boolean
) from public, anon, authenticated;

grant execute on function public.create_storefront_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric,
  text, text, text, uuid, timestamptz, boolean
) to service_role;
