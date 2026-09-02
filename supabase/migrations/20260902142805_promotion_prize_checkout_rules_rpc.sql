create or replace function public.save_promotion_prize_checkout_rules(
  p_restaurant_id uuid,
  p_campaign_id uuid,
  p_rules jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rule jsonb;
  v_prize_id uuid;
  v_minimum_order numeric;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid checkout rule payload';
  end if;

  if not exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'Restaurant membership required';
  end if;

  if not exists (
    select 1
    from public.promotion_campaigns pc
    where pc.id = p_campaign_id
      and pc.restaurant_id = p_restaurant_id
      and pc.kind = 'roulette'
  ) then
    raise exception using errcode = '23503', message = 'Campaign not found for restaurant';
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    begin
      v_prize_id := nullif(v_rule ->> 'prize_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'Invalid prize id';
    end;

    v_minimum_order := coalesce(nullif(v_rule ->> 'minimum_order_amount', '')::numeric, 0);
    if v_prize_id is null then
      raise exception using errcode = '22023', message = 'Prize id is required';
    end if;
    if v_minimum_order < 0 then
      raise exception using errcode = '23514', message = 'Prize minimum order amount cannot be negative';
    end if;

    update public.promotion_prizes pp
    set minimum_order_amount = round(v_minimum_order, 2),
        updated_at = now()
    where pp.id = v_prize_id
      and pp.restaurant_id = p_restaurant_id
      and pp.campaign_id = p_campaign_id
      and pp.prize_type <> 'no_prize'
      and pp.active;

    if not found then
      raise exception using errcode = '23503', message = 'Active prize not found for campaign';
    end if;
  end loop;
end;
$$;

revoke all on function public.save_promotion_prize_checkout_rules(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_promotion_prize_checkout_rules(uuid, uuid, jsonb) to authenticated;
