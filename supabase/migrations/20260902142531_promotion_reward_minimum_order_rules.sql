-- Persist checkout-specific prize rules without rewriting the core wheel save function.

create or replace function public.save_promotion_wheel_campaign_checkout(
  p_campaign_id uuid,
  p_restaurant_id uuid,
  p_campaign jsonb,
  p_rules jsonb,
  p_prizes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_prize jsonb;
  v_sort_order integer := 0;
  v_minimum_order numeric;
begin
  if jsonb_typeof(coalesce(p_prizes, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid prize payload';
  end if;

  v_campaign_id := public.save_promotion_wheel_campaign(
    p_campaign_id,
    p_restaurant_id,
    p_campaign,
    p_rules,
    p_prizes
  );

  for v_prize in select value from jsonb_array_elements(p_prizes)
  loop
    v_minimum_order := coalesce(nullif(v_prize ->> 'minimum_order_amount', '')::numeric, 0);
    if v_minimum_order < 0 then
      raise exception using errcode = '23514', message = 'Prize minimum order amount cannot be negative';
    end if;

    update public.promotion_prizes pp
    set minimum_order_amount = case
          when pp.prize_type = 'no_prize' then 0
          else round(v_minimum_order, 2)
        end,
        updated_at = now()
    where pp.restaurant_id = p_restaurant_id
      and pp.campaign_id = v_campaign_id
      and pp.sort_order = v_sort_order
      and pp.active;

    if not found then
      raise exception using errcode = '55000', message = 'Saved prize could not be matched to checkout rules';
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  return v_campaign_id;
end;
$$;

revoke all on function public.save_promotion_wheel_campaign_checkout(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_promotion_wheel_campaign_checkout(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
