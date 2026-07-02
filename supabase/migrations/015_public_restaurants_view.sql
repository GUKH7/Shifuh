-- Exposes only storefront-safe restaurant fields to anonymous visitors.
-- The base restaurants table keeps owner/admin access, but is no longer broadly public.

drop view if exists public.public_restaurants;

alter table public.restaurants
  add column if not exists rating_average numeric,
  add column if not exists rating_count integer default 0;

create view public.public_restaurants
with (security_barrier = true)
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
  rating_count
from public.restaurants;

revoke all on public.public_restaurants from public;
grant select on public.public_restaurants to anon, authenticated;

drop policy if exists "Public can read restaurants" on public.restaurants;
drop policy if exists "Restaurants are viewable by everyone" on public.restaurants;
drop policy if exists "Public restaurants are viewable by everyone" on public.restaurants;
drop policy if exists "Public_Select" on public.restaurants;
drop policy if exists "Public_View" on public.restaurants;
drop policy if exists "Dados da loja são públicos" on public.restaurants;
drop policy if exists "Público pode ver os restaurantes" on public.restaurants;
drop policy if exists "Restaurantes publicos" on public.restaurants;
