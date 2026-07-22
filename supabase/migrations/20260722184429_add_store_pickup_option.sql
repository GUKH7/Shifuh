alter table public.restaurants
  add column if not exists pickup_enabled boolean not null default false;

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
  scheduled_order_lead_minutes,
  pickup_enabled
from public.restaurants;

revoke all on public.public_restaurants from public;
grant select on public.public_restaurants to anon, authenticated;
