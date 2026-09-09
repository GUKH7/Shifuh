-- Fix product edits blocked by the free-product reward guard.
--
-- The product trigger was running as the authenticated caller and, after the
-- loyalty hardening, called app_private.loyalty_reward_product_requires_options(),
-- whose EXECUTE privilege is intentionally revoked from browser roles. Keep the
-- helper private and move the trigger body into app_private as SECURITY DEFINER.
-- This preserves the reward integrity checks without exposing privileged helpers.

create or replace function app_private.guard_product_required_addons_for_active_rewards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_options boolean := false;
  v_has_dependency boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('promotion-free-product:' || new.id::text, 0)
  );

  v_requires_options := app_private.loyalty_reward_product_requires_options(new.addons);

  if coalesce(new.is_active, false) = false or v_requires_options then
    v_has_dependency := exists (
      select 1
      from public.promotion_prizes pp
      where pp.restaurant_id = new.restaurant_id
        and pp.product_id = new.id
        and pp.prize_type = 'free_product'
        and pp.active = true
    ) or exists (
      select 1
      from public.customer_rewards cr
      where cr.restaurant_id = new.restaurant_id
        and cr.product_id = new.id
        and cr.reward_type = 'free_product'
        and cr.status = 'available'
        and (cr.expires_at is null or cr.expires_at > pg_catalog.now())
    ) or exists (
      select 1
      from public.loyalty_rewards lr
      where lr.restaurant_id = new.restaurant_id
        and lr.product_id = new.id
        and lr.reward_type = 'free_product'
        and lr.active = true
    ) or exists (
      select 1
      from public.loyalty_redemptions lrd
      where lrd.restaurant_id = new.restaurant_id
        and lrd.product_id = new.id
        and lrd.reward_type = 'free_product'
        and lrd.status = 'available'
        and (lrd.expires_at is null or lrd.expires_at > pg_catalog.now())
    );

    if v_has_dependency then
      if coalesce(new.is_active, false) = false then
        raise exception using
          errcode = '23514',
          message = 'Product cannot be deactivated while used by an active or issued free-product reward';
      end if;

      raise exception using
        errcode = '23514',
        message = 'Product cannot require add-ons while used by an active or issued free-product reward';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_product_required_addons_for_active_rewards()
from public, anon, authenticated;

drop trigger if exists products_guard_required_addons_for_active_rewards on public.products;
create trigger products_guard_required_addons_for_active_rewards
before update of addons, is_active
on public.products
for each row
execute function app_private.guard_product_required_addons_for_active_rewards();

-- The old public trigger function is no longer part of the execution path.
drop function if exists public.guard_product_required_addons_for_active_rewards();

comment on function app_private.guard_product_required_addons_for_active_rewards() is
  'Internal SECURITY DEFINER trigger guard that protects free-product rewards while allowing authorized product edits without exposing private helper functions.';
