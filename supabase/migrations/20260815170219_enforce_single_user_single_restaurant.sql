-- Temporarily keep Shifuh in a strict 1 user <-> 1 restaurant model.
-- Multi-user and plan-based seat infrastructure remains dormant for future use.

update public.restaurant_members
set role = 'owner',
    is_default = true
where role <> 'owner' or is_default is distinct from true;

-- Disable the plan seat-limit feature. The subscription tables are intentionally
-- preserved so the feature can be reactivated later without rebuilding billing data.
drop trigger if exists restaurant_members_enforce_plan_limit on public.restaurant_members;

revoke all on function app_private.enforce_restaurant_member_limit() from public, anon, authenticated, service_role;
revoke all on function app_private.get_restaurant_member_entitlement(uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.get_restaurant_member_entitlement(uuid) to service_role;

drop function if exists public.get_restaurant_member_entitlement(uuid);

-- Store switching is intentionally disabled while the product is 1:1.
drop function if exists public.set_default_restaurant(uuid);
drop function if exists app_private.set_default_restaurant(uuid);

-- A user may own only one restaurant, and a restaurant may have only one member.
create unique index if not exists restaurants_single_restaurant_per_user_uidx
  on public.restaurants(user_id)
  where user_id is not null;

create unique index if not exists restaurant_members_single_restaurant_per_user_uidx
  on public.restaurant_members(user_id);

create unique index if not exists restaurant_members_single_user_per_restaurant_uidx
  on public.restaurant_members(restaurant_id);

alter table public.restaurant_members
  drop constraint if exists restaurant_members_single_user_owner_only,
  add constraint restaurant_members_single_user_owner_only
    check (role = 'owner');

alter table public.restaurant_members
  drop constraint if exists restaurant_members_single_user_default_only,
  add constraint restaurant_members_single_user_default_only
    check (is_default = true);

comment on table public.restaurant_members is
  'Canonical restaurant authorization mapping. Current product mode is strict 1 user <-> 1 restaurant; multi-user support is intentionally disabled.';

comment on table public.subscription_plans is
  'Dormant future billing catalog. User-seat limits are currently disabled while Shifuh operates as 1 user <-> 1 restaurant.';

comment on table public.restaurant_subscriptions is
  'Dormant future subscription state. User-seat limits are currently disabled while Shifuh operates as 1 user <-> 1 restaurant.';
