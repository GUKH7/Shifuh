-- Server-side eligibility and result engine for the storefront lucky wheel.
-- Both RPCs are intentionally restricted to service_role. The browser never decides a result.

create or replace function public.grant_eligible_promotion_spin(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_order_id uuid
)
returns table (
  spin_id uuid,
  campaign_id uuid,
  campaign_name text,
  customer_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign public.promotion_campaigns%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_rule public.promotion_eligibility_rules%rowtype;
  v_spin public.promotion_spins%rowtype;
  v_order_count integer := 0;
  v_spend_total numeric := 0;
  v_spend_before numeric := 0;
  v_rule_count integer := 0;
  v_rule_ok boolean;
  v_rule_results jsonb := '{}'::jsonb;
  v_primary_rule_id uuid := null;
  v_local_order_time timestamp;
  v_period_start timestamptz;
  v_existing_spins integer;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
    and restaurant_id = p_restaurant_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'Order not found for restaurant';
  end if;

  if coalesce(v_order.is_test, false) then
    return;
  end if;

  select * into v_customer
  from public.customers
  where id = p_customer_id
    and restaurant_id = p_restaurant_id;

  if not found then
    raise exception using errcode = '23503', message = 'Customer not found for restaurant';
  end if;

  if btrim(coalesce(v_customer.phone, '')) <> btrim(coalesce(v_order.customer_phone, '')) then
    raise exception using errcode = '23514', message = 'Order and customer do not match';
  end if;

  select * into v_campaign
  from public.promotion_campaigns
  where restaurant_id = p_restaurant_id
    and kind = 'roulette'
    and status = 'active'
    and starts_at <= now()
    and ends_at > now()
  order by created_at desc, id desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  select count(*)::integer,
         coalesce(sum(total), 0)
    into v_order_count, v_spend_total
  from public.orders
  where restaurant_id = p_restaurant_id
    and customer_phone = v_customer.phone
    and coalesce(is_test, false) = false
    and status <> 'canceled'
    and created_at <= v_order.created_at;

  v_spend_before := greatest(v_spend_total - coalesce(v_order.total, 0), 0);
  v_local_order_time := timezone('America/Sao_Paulo', v_order.created_at);

  for v_rule in
    select *
    from public.promotion_eligibility_rules
    where campaign_id = v_campaign.id
      and restaurant_id = p_restaurant_id
      and enabled
    order by created_at, id
  loop
    v_rule_count := v_rule_count + 1;
    v_rule_ok := false;

    case v_rule.rule_type
      when 'completed_order' then
        v_rule_ok := v_order.status <> 'canceled';
      when 'minimum_order' then
        v_rule_ok := coalesce(v_order.subtotal, v_order.total, 0) >= coalesce(v_rule.threshold_amount, 0);
      when 'every_orders' then
        v_rule_ok := v_rule.threshold_count is not null
          and v_rule.threshold_count > 0
          and v_order_count > 0
          and mod(v_order_count, v_rule.threshold_count) = 0;
      when 'spend_threshold' then
        v_rule_ok := v_rule.threshold_amount is not null
          and v_rule.threshold_amount > 0
          and floor(v_spend_total / v_rule.threshold_amount) > floor(v_spend_before / v_rule.threshold_amount);
      when 'first_purchase' then
        v_rule_ok := v_order_count = 1;
      when 'schedule' then
        v_rule_ok := extract(dow from v_local_order_time)::smallint = any(v_rule.weekdays)
          and v_local_order_time::time >= v_rule.start_time
          and v_local_order_time::time < v_rule.end_time;
      when 'customer_spin_limit' then
        if v_rule.limit_period = 'day' then
          v_period_start := date_trunc('day', v_local_order_time) at time zone 'America/Sao_Paulo';
        elsif v_rule.limit_period = 'week' then
          v_period_start := date_trunc('week', v_local_order_time) at time zone 'America/Sao_Paulo';
        else
          v_period_start := v_campaign.starts_at;
        end if;

        select count(*)::integer into v_existing_spins
        from public.promotion_spins s
        where s.restaurant_id = p_restaurant_id
          and s.campaign_id = v_campaign.id
          and s.customer_id = p_customer_id
          and s.created_at >= coalesce(v_period_start, v_campaign.starts_at);

        v_rule_ok := v_existing_spins < coalesce(v_rule.max_spins, 0);
      else
        v_rule_ok := false;
    end case;

    v_rule_results := v_rule_results || jsonb_build_object(
      v_rule.rule_type,
      jsonb_build_object(
        'passed', v_rule_ok,
        'rule_id', v_rule.id,
        'threshold_amount', v_rule.threshold_amount,
        'threshold_count', v_rule.threshold_count,
        'max_spins', v_rule.max_spins,
        'limit_period', v_rule.limit_period
      )
    );

    if v_primary_rule_id is null and v_rule.rule_type not in ('schedule', 'customer_spin_limit') then
      v_primary_rule_id := v_rule.id;
    end if;

    if not v_rule_ok then
      return;
    end if;
  end loop;

  if v_rule_count = 0 then
    return;
  end if;

  insert into public.promotion_spins (
    restaurant_id,
    campaign_id,
    customer_id,
    source_order_id,
    eligibility_rule_id,
    idempotency_key,
    eligibility_snapshot
  ) values (
    p_restaurant_id,
    v_campaign.id,
    p_customer_id,
    p_order_id,
    v_primary_rule_id,
    'campaign:' || v_campaign.id::text || ':order:' || p_order_id::text,
    jsonb_build_object(
      'evaluated_at', now(),
      'order_count', v_order_count,
      'spend_total', v_spend_total,
      'order_total', v_order.total,
      'rules', v_rule_results
    )
  )
  on conflict (restaurant_id, idempotency_key) do nothing
  returning * into v_spin;

  if not found then
    select * into v_spin
    from public.promotion_spins
    where restaurant_id = p_restaurant_id
      and idempotency_key = 'campaign:' || v_campaign.id::text || ':order:' || p_order_id::text;
  end if;

  if v_spin.status <> 'pending' then
    return;
  end if;

  spin_id := v_spin.id;
  campaign_id := v_campaign.id;
  campaign_name := v_campaign.name;
  customer_id := p_customer_id;
  return next;
end;
$$;

revoke all on function public.grant_eligible_promotion_spin(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_eligible_promotion_spin(uuid, uuid, uuid) to service_role;

create or replace function public.resolve_promotion_spin(p_spin_id uuid)
returns table (
  spin_id uuid,
  result_id uuid,
  prize_id uuid,
  prize_type text,
  prize_label text,
  percentage_value numeric,
  fixed_amount numeric,
  product_id uuid,
  reward_id uuid,
  reward_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_spin public.promotion_spins%rowtype;
  v_campaign public.promotion_campaigns%rowtype;
  v_prize public.promotion_prizes%rowtype;
  v_existing_result public.promotion_spin_results%rowtype;
  v_total_weight numeric := 0;
  v_roll numeric := random() * 100;
  v_result_id uuid;
  v_reward_id uuid;
  v_reward_expires_at timestamptz;
begin
  select * into v_spin
  from public.promotion_spins
  where id = p_spin_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Promotion spin not found';
  end if;

  if v_spin.status = 'resolved' then
    select * into v_existing_result
    from public.promotion_spin_results
    where spin_id = v_spin.id;

    select r.id, r.expires_at
      into v_reward_id, v_reward_expires_at
    from public.customer_rewards r
    where r.spin_id = v_spin.id;

    spin_id := v_spin.id;
    result_id := v_existing_result.id;
    prize_id := v_existing_result.prize_id;
    prize_type := v_existing_result.prize_type;
    prize_label := v_existing_result.prize_label;
    percentage_value := v_existing_result.percentage_value;
    fixed_amount := v_existing_result.fixed_amount;
    product_id := v_existing_result.product_id;
    reward_id := v_reward_id;
    reward_expires_at := v_reward_expires_at;
    return next;
    return;
  end if;

  if v_spin.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Promotion spin is not available';
  end if;

  select * into v_campaign
  from public.promotion_campaigns
  where id = v_spin.campaign_id
    and restaurant_id = v_spin.restaurant_id
  for update;

  if not found
    or v_campaign.status <> 'active'
    or v_campaign.starts_at > now()
    or v_campaign.ends_at <= now() then
    raise exception using errcode = '55000', message = 'Promotion campaign is not active';
  end if;

  if v_campaign.distribution_mode = 'probability' then
    if exists (
      select 1
      from public.promotion_prizes p
      where p.restaurant_id = v_spin.restaurant_id
        and p.campaign_id = v_spin.campaign_id
        and p.active
        and p.probability is null
    ) then
      raise exception using errcode = '23514', message = 'Probability campaign has prize without probability';
    end if;

    select coalesce(sum(p.probability), 0)
      into v_total_weight
    from public.promotion_prizes p
    where p.restaurant_id = v_spin.restaurant_id
      and p.campaign_id = v_spin.campaign_id
      and p.active;

    if abs(v_total_weight - 100) > 0.01 then
      raise exception using errcode = '23514', message = 'Probability campaign must total 100 percent';
    end if;

    with weighted as (
      select
        p.id,
        p.sort_order,
        sum(p.probability) over (order by p.sort_order, p.id) as cumulative_weight
      from public.promotion_prizes p
      where p.restaurant_id = v_spin.restaurant_id
        and p.campaign_id = v_spin.campaign_id
        and p.active
    )
    select p.* into v_prize
    from weighted w
    join public.promotion_prizes p on p.id = w.id
    where w.cumulative_weight > v_roll
    order by w.sort_order, w.id
    limit 1;
  else
    if exists (
      select 1
      from public.promotion_prizes p
      where p.restaurant_id = v_spin.restaurant_id
        and p.campaign_id = v_spin.campaign_id
        and p.active
        and p.prize_type <> 'no_prize'
        and (p.frequency_every is null or p.frequency_every <= 0)
    ) then
      raise exception using errcode = '23514', message = 'Frequency campaign has prize without frequency';
    end if;

    select coalesce(sum(100.0 / p.frequency_every), 0)
      into v_total_weight
    from public.promotion_prizes p
    where p.restaurant_id = v_spin.restaurant_id
      and p.campaign_id = v_spin.campaign_id
      and p.active
      and p.prize_type <> 'no_prize';

    if v_total_weight > 100.0001 then
      raise exception using errcode = '23514', message = 'Frequency campaign exceeds 100 percent effective probability';
    end if;

    if v_roll < v_total_weight then
      with weighted as (
        select
          p.id,
          p.sort_order,
          sum(100.0 / p.frequency_every) over (order by p.sort_order, p.id) as cumulative_weight
        from public.promotion_prizes p
        where p.restaurant_id = v_spin.restaurant_id
          and p.campaign_id = v_spin.campaign_id
          and p.active
          and p.prize_type <> 'no_prize'
      )
      select p.* into v_prize
      from weighted w
      join public.promotion_prizes p on p.id = w.id
      where w.cumulative_weight > v_roll
      order by w.sort_order, w.id
      limit 1;
    else
      select p.* into v_prize
      from public.promotion_prizes p
      where p.restaurant_id = v_spin.restaurant_id
        and p.campaign_id = v_spin.campaign_id
        and p.active
        and p.prize_type = 'no_prize'
      order by p.sort_order, p.id
      limit 1;

      if not found then
        raise exception using errcode = '23514', message = 'Frequency campaign needs a no-prize fallback';
      end if;
    end if;
  end if;

  if v_prize.id is null then
    raise exception using errcode = '55000', message = 'No prize could be selected';
  end if;

  insert into public.promotion_spin_results (
    spin_id,
    restaurant_id,
    campaign_id,
    customer_id,
    prize_id,
    prize_type,
    prize_label,
    percentage_value,
    fixed_amount,
    product_id,
    reward_validity_minutes,
    decision_mode,
    engine_version,
    decision_metadata
  ) values (
    v_spin.id,
    v_spin.restaurant_id,
    v_spin.campaign_id,
    v_spin.customer_id,
    v_prize.id,
    v_prize.prize_type,
    v_prize.label,
    v_prize.percentage_value,
    v_prize.fixed_amount,
    v_prize.product_id,
    v_prize.reward_validity_minutes,
    v_campaign.distribution_mode,
    'v1',
    jsonb_build_object(
      'roll', round(v_roll, 6),
      'effective_total', round(v_total_weight, 6),
      'resolved_at', now()
    )
  )
  returning id into v_result_id;

  select r.id, r.expires_at
    into v_reward_id, v_reward_expires_at
  from public.customer_rewards r
  where r.spin_id = v_spin.id;

  spin_id := v_spin.id;
  result_id := v_result_id;
  prize_id := v_prize.id;
  prize_type := v_prize.prize_type;
  prize_label := v_prize.label;
  percentage_value := v_prize.percentage_value;
  fixed_amount := v_prize.fixed_amount;
  product_id := v_prize.product_id;
  reward_id := v_reward_id;
  reward_expires_at := v_reward_expires_at;
  return next;
end;
$$;

revoke all on function public.resolve_promotion_spin(uuid) from public, anon, authenticated;
grant execute on function public.resolve_promotion_spin(uuid) to service_role;
