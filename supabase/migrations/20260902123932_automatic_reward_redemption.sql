-- Apply won rewards safely during storefront checkout.
-- Reward rules are snapshotted from the prize into the spin result and customer wallet.

alter table public.promotion_prizes
  add column if not exists minimum_order_amount numeric(12,2) not null default 0;

alter table public.promotion_spin_results
  add column if not exists minimum_order_amount numeric(12,2) not null default 0;

alter table public.customer_rewards
  add column if not exists minimum_order_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.promotion_prizes'::regclass
      and conname = 'promotion_prizes_minimum_order_check'
  ) then
    alter table public.promotion_prizes
      add constraint promotion_prizes_minimum_order_check check (minimum_order_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.promotion_spin_results'::regclass
      and conname = 'promotion_spin_results_minimum_order_check'
  ) then
    alter table public.promotion_spin_results
      add constraint promotion_spin_results_minimum_order_check check (minimum_order_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_rewards'::regclass
      and conname = 'customer_rewards_minimum_order_check'
  ) then
    alter table public.customer_rewards
      add constraint customer_rewards_minimum_order_check check (minimum_order_amount >= 0);
  end if;
end;
$$;

create or replace function app_private.prepare_promotion_spin_result()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_spin public.promotion_spins%rowtype;
  v_prize public.promotion_prizes%rowtype;
  v_campaign public.promotion_campaigns%rowtype;
  v_awards integer;
  v_prize_awards integer;
  v_customer_prize_awards integer;
begin
  select * into v_spin
  from public.promotion_spins
  where id = new.spin_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Promotion spin not found';
  end if;

  if v_spin.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Promotion spin is not pending';
  end if;

  select * into v_campaign
  from public.promotion_campaigns
  where id = v_spin.campaign_id
    and restaurant_id = v_spin.restaurant_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Promotion campaign not found';
  end if;

  select * into v_prize
  from public.promotion_prizes
  where id = new.prize_id
    and restaurant_id = v_spin.restaurant_id
    and campaign_id = v_spin.campaign_id
    and active;

  if not found then
    raise exception using errcode = '23503', message = 'Active promotion prize not found for this campaign';
  end if;

  if v_prize.prize_type <> 'no_prize' then
    select count(*)::integer into v_awards
    from public.promotion_spin_results r
    where r.campaign_id = v_spin.campaign_id
      and r.prize_type <> 'no_prize';

    if v_campaign.max_awards is not null and v_awards >= v_campaign.max_awards then
      raise exception using errcode = '23514', message = 'Campaign award limit reached';
    end if;

    select count(*)::integer into v_prize_awards
    from public.promotion_spin_results r
    where r.prize_id = v_prize.id
      and r.prize_type <> 'no_prize';

    if v_prize.quantity_limit is not null and v_prize_awards >= v_prize.quantity_limit then
      raise exception using errcode = '23514', message = 'Prize quantity limit reached';
    end if;

    select count(*)::integer into v_customer_prize_awards
    from public.promotion_spin_results r
    where r.prize_id = v_prize.id
      and r.customer_id = v_spin.customer_id
      and r.prize_type <> 'no_prize';

    if v_prize.per_customer_limit is not null and v_customer_prize_awards >= v_prize.per_customer_limit then
      raise exception using errcode = '23514', message = 'Customer prize limit reached';
    end if;
  end if;

  new.restaurant_id := v_spin.restaurant_id;
  new.campaign_id := v_spin.campaign_id;
  new.customer_id := v_spin.customer_id;
  new.prize_type := v_prize.prize_type;
  new.prize_label := v_prize.label;
  new.percentage_value := v_prize.percentage_value;
  new.fixed_amount := v_prize.fixed_amount;
  new.product_id := v_prize.product_id;
  new.reward_validity_minutes := v_prize.reward_validity_minutes;
  new.minimum_order_amount := v_prize.minimum_order_amount;
  new.decision_mode := v_campaign.distribution_mode;
  new.created_at := now();

  if jsonb_typeof(new.decision_metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'Decision metadata must be a JSON object';
  end if;

  return new;
end;
$$;

create or replace function app_private.finalize_promotion_spin_result()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.promotion_spins
  set status = 'resolved', resolved_at = new.created_at
  where id = new.spin_id
    and status = 'pending';

  if not found then
    raise exception using errcode = '55000', message = 'Promotion spin could not be resolved';
  end if;

  if new.prize_type <> 'no_prize' then
    insert into public.customer_rewards (
      restaurant_id,
      campaign_id,
      customer_id,
      spin_id,
      spin_result_id,
      prize_id,
      reward_type,
      label,
      percentage_value,
      fixed_amount,
      product_id,
      minimum_order_amount,
      expires_at
    ) values (
      new.restaurant_id,
      new.campaign_id,
      new.customer_id,
      new.spin_id,
      new.id,
      new.prize_id,
      new.prize_type,
      new.prize_label,
      new.percentage_value,
      new.fixed_amount,
      new.product_id,
      new.minimum_order_amount,
      case
        when new.reward_validity_minutes is null then null
        else new.created_at + make_interval(mins => new.reward_validity_minutes)
      end
    );
  end if;

  return new;
end;
$$;

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

  select o.* into v_existing_order
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.idempotency_key = v_idempotency_key;

  if found then
    select cr.* into v_reward
    from public.customer_rewards cr
    where cr.redeemed_order_id = v_existing_order.id
    limit 1;

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
