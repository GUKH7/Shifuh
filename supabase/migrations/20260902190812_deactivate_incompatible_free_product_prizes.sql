-- Repair legacy active free-product prizes that predate the required-add-on guards.
-- If an incompatible prize exists, pause the campaign before deactivating the prize so
-- probability/frequency distribution can be explicitly reviewed before reactivation.

with incompatible as (
  select pp.id as prize_id, pp.campaign_id
  from public.promotion_prizes pp
  join public.products p
    on p.id = pp.product_id
   and p.restaurant_id = pp.restaurant_id
  where pp.active = true
    and pp.prize_type = 'free_product'
    and coalesce(jsonb_typeof(p.addons), 'null') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(p.addons, '[]'::jsonb)) addon_group
      where coalesce((addon_group ->> 'required')::boolean, false) = true
         or coalesce(nullif(addon_group ->> 'min_options', '')::integer, 0) > 0
    )
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
