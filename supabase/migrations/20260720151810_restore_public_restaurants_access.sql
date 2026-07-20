-- Keep the restaurants table private while allowing the restricted public view
-- to read the storefront-safe columns selected by its definition.
alter view public.public_restaurants
  set (security_invoker = false, security_barrier = true);

revoke all on public.public_restaurants from public;
grant select on public.public_restaurants to anon, authenticated;
