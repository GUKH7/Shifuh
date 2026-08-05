alter table public.restaurants
  add column if not exists accepted_payment_methods jsonb not null
  default '["pix", "credit", "debit", "cash"]'::jsonb;

alter table public.restaurants
  drop constraint if exists restaurants_accepted_payment_methods_check;

alter table public.restaurants
  add constraint restaurants_accepted_payment_methods_check
  check (
    jsonb_typeof(accepted_payment_methods) = 'array'
    and jsonb_array_length(accepted_payment_methods) > 0
    and accepted_payment_methods <@ '["pix", "credit", "debit", "cash"]'::jsonb
  );

drop view if exists public.public_restaurants;

create view public.public_restaurants
with (security_invoker = false, security_barrier = true)
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
  pickup_enabled,
  accepted_payment_methods
from public.restaurants;

revoke all privileges on public.public_restaurants from public, anon, authenticated;
grant select on public.public_restaurants to anon, authenticated;
