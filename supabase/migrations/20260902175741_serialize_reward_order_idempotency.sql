create or replace function public.create_storefront_order_with_reward_transaction(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address jsonb,
  p_items jsonb,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_payment_method text,
  p_change_for text,
  p_user_id uuid,
  p_scheduled_for timestamptz,
  p_save_customer boolean,
  p_idempotency_key text,
  p_reward_id uuid
)
returns table (
  order_id uuid,
  display_number integer,
  reward_discount numeric,
  order_total numeric,
  reward_id uuid,
  reward_type text,
  reward_label text
)
language plpgsql
set search_path = ''
as $$
declare
  v_existing_order public.orders%rowtype;
  v_reward public.customer_rewards%rowtype;
  v_customer public.customers%rowtype;
  v_product public.products%rowtype;
  v_created record;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_idempotency_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
begin
  if p_reward_id is null then
    raise exception using errcode = '22023', message = 'Reward is required';
  end if;

  if v_idempotency_key = '' or char_length(v_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'Valid idempotency key is required';
  end if;

  -- Serialize every reward attempt that shares the same restaurant + idempotency key.
  -- This closes the race where two requests could lock different rewards before either
  -- one had created the order, then both attach their reward to the winning order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_restaurant_id::text || ':' || v_idempotency_key, 0)
  );

  select o.* into v_existing_order
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.idempotency_key = v_idempotency_key;

  if found then
    select cr.* into v_reward
    from public.customer_rewards cr
    where cr.redeemed_order_id = v_existing_order.id
      and cr.restaurant_id = p_restaurant_id
    limit 1;

    if not found or v_reward.id <> p_reward_id then
      raise exception using errcode = '23514', message = 'Idempotency key already used with a different reward';
    end if;

    order_id := v_existing_order.id;
    display_number := v_existing_order.display_number;
    reward_discount := coalesce(v_existing_order.discount, 0);
    order_total := v_existing_order.total;
    reward_id := v_reward.id;
    reward_type := v_reward.reward_type;
    reward_label := v_reward.label;
    return next;
    return;
  end if;

  select cr.* into v_reward
  from public.customer_rewards cr
  where cr.id = p_reward_id
    and cr.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Reward not found';
  end if;

  if v_reward.status = 'redeemed' then
    if v_reward.redeemed_order_id is not null then
      select o.* into v_existing_order
      from public.orders o
      where o.id = v_reward.redeemed_order_id
        and o.restaurant_id = p_restaurant_id
        and o.idempotency_key = v_idempotency_key;

      if found then
        order_id := v_existing_order.id;
        display_number := v_existing_order.display_number;
        reward_discount := coalesce(v_existing_order.discount, 0);
        order_total := v_existing_order.total;
        reward_id := v_reward.id;
        reward_type := v_reward.reward_type;
        reward_label := v_reward.label;
        return next;
        return;
      end if;
    end if;
    raise exception using errcode = '23514', message = 'Reward has already been redeemed';
  end if;

  if v_reward.status <> 'available' then
    raise exception using errcode = '23514', message = 'Reward is unavailable';
  end if;

  if v_reward.expires_at is not null and v_reward.expires_at <= now() then
    raise exception using errcode = '23514', message = 'Reward is expired';
  end if;

  if round(coalesce(p_subtotal, 0)::numeric, 2) < v_reward.minimum_order_amount then
    raise exception using errcode = '23514', message = 'Reward minimum order amount not reached';
  end if;

  select c.* into v_customer
  from public.customers c
  where c.id = v_reward.customer_id
    and c.restaurant_id = p_restaurant_id;

  if not found or regexp_replace(coalesce(v_customer.phone, ''), '\D', '', 'g') <> v_phone then
    raise exception using errcode = '42501', message = 'Reward does not belong to this customer';
  end if;

  if v_reward.reward_type = 'percent' then
    v_discount := least(
      round(coalesce(p_subtotal, 0)::numeric * coalesce(v_reward.percentage_value, 0) / 100, 2),
      round(coalesce(p_subtotal, 0)::numeric, 2)
    );
  elsif v_reward.reward_type = 'fixed' then
    v_discount := least(
      round(coalesce(v_reward.fixed_amount, 0)::numeric, 2),
      round(coalesce(p_subtotal, 0)::numeric, 2)
    );
  elsif v_reward.reward_type = 'free_shipping' then
    if coalesce(p_address ->> 'fulfillment_type', 'delivery') <> 'delivery' or coalesce(p_delivery_fee, 0) <= 0 then
      raise exception using errcode = '23514', message = 'Free shipping reward requires a paid delivery';
    end if;
    v_discount := round(coalesce(p_delivery_fee, 0)::numeric, 2);
  elsif v_reward.reward_type = 'free_product' then
    select p.* into v_product
    from public.products p
    where p.id = v_reward.product_id
      and p.restaurant_id = p_restaurant_id
      and p.is_active = true;

    if not found then
      raise exception using errcode = '23514', message = 'Free product reward is unavailable';
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_name', v_product.name,
      'quantity', 1,
      'price', 0,
      'observation', 'Prêmio da Roleta da Sorte',
      'addons', '[]'::jsonb
    ));
  else
    raise exception using errcode = '23514', message = 'Unsupported reward type';
  end if;

  v_total := greatest(
    round(coalesce(p_subtotal, 0)::numeric, 2)
      + round(coalesce(p_delivery_fee, 0)::numeric, 2)
      - v_discount,
    0
  );

  select * into v_created
  from public.create_storefront_order_transaction(
    p_restaurant_id => p_restaurant_id,
    p_customer_name => p_customer_name,
    p_customer_phone => v_phone,
    p_address => p_address,
    p_items => v_items,
    p_subtotal => round(coalesce(p_subtotal, 0)::numeric, 2),
    p_delivery_fee => round(coalesce(p_delivery_fee, 0)::numeric, 2),
    p_discount => v_discount,
    p_total => v_total,
    p_payment_method => p_payment_method,
    p_change_for => p_change_for,
    p_coupon_code => null,
    p_user_id => p_user_id,
    p_scheduled_for => p_scheduled_for,
    p_save_customer => p_save_customer,
    p_idempotency_key => v_idempotency_key
  );

  if v_created.order_id is null then
    raise exception using errcode = '55000', message = 'Order could not be created';
  end if;

  update public.customer_rewards cr
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_order_id = v_created.order_id,
      updated_at = now()
  where cr.id = v_reward.id
    and cr.status = 'available';

  if not found then
    raise exception using errcode = '55000', message = 'Reward could not be redeemed';
  end if;

  order_id := v_created.order_id;
  display_number := v_created.display_number;
  reward_discount := v_discount;
  order_total := v_total;
  reward_id := v_reward.id;
  reward_type := v_reward.reward_type;
  reward_label := v_reward.label;
  return next;
end;
$$;

revoke all on function public.create_storefront_order_with_reward_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, uuid, timestamptz, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_storefront_order_with_reward_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, uuid, timestamptz, boolean, text, uuid
) to service_role;
