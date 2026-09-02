-- Keep product availability synchronized with automatic free-product prizes/rewards.
-- Install the availability-aware trigger before cleanup so concurrent product status
-- changes cannot slip through the upgrade window.

create or replace function public.guard_product_required_addons_for_active_rewards()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requires_options boolean := false;
  v_has_dependency boolean := false;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('promotion-free-product:' || new.id::text, 0)
  );

  v_requires_options := coalesce(jsonb_typeof(new.addons), 'null') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb)) addon_group
      where coalesce((addon_group ->> 'required')::boolean, false)
         or coalesce(nullif(addon_group ->> 'min_options', '')::integer, 0) > 0
    );

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
        and (cr.expires_at is null or cr.expires_at > now())
    );

    if v_has_dependency then
      if coalesce(new.is_active, false) = false then
        raise exception using errcode = '23514', message = 'Product cannot be deactivated while used by an active or issued free-product reward';
      end if;

      raise exception using errcode = '23514', message = 'Product cannot require add-ons while used by an active or issued free-product reward';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_product_required_addons_for_active_rewards() from public, anon, authenticated;

drop trigger if exists products_guard_required_addons_for_active_rewards on public.products;
create trigger products_guard_required_addons_for_active_rewards
before update of addons, is_active
on public.products
for each row
execute function public.guard_product_required_addons_for_active_rewards();

-- Repair any legacy available rewards that already point to an inactive product.
update public.customer_rewards cr
set status = 'cancelled',
    updated_at = now()
from public.products p
where cr.product_id = p.id
  and cr.restaurant_id = p.restaurant_id
  and cr.reward_type = 'free_product'
  and cr.status = 'available'
  and (cr.expires_at is null or cr.expires_at > now())
  and p.is_active = false;

-- Repair any legacy active prizes that already point to an inactive product.
with incompatible as (
  select pp.id as prize_id, pp.campaign_id
  from public.promotion_prizes pp
  join public.products p
    on p.id = pp.product_id
   and p.restaurant_id = pp.restaurant_id
  where pp.active = true
    and pp.prize_type = 'free_product'
    and p.is_active = false
), paused as (
  update public.promotion_campaigns pc
  set status = 'paused',
      updated_at = now()
  where pc.id in (select distinct campaign_id from incompatible)
    and pc.status in ('active', 'scheduled')
  returning pc.id
)
update public.promotion_prizes pp
set active = false,
    updated_at = now()
where pp.id in (select prize_id from incompatible);
