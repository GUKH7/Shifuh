-- Prevent historical orders from being reused by a later active roulette campaign.

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
  v_unlock_rule_count integer := 0;
  v_unlock_passed boolean := false;
  v_rule_ok boolean;
  v_rule_results jsonb := '{}'::jsonb;
  v_primary_rule_id uuid := null;
  v_local_order_time timestamp;
  v_period_start timestamptz;
  v_existing_spins integer;
begin
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
    and o.restaurant_id = p_restaurant_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'Order not found for restaurant';
  end if;

  if coalesce(v_order.is_test, false) then
    return;
  end if;

  select c.* into v_customer
  from public.customers c
  where c.id = p_customer_id
    and c.restaurant_id = p_restaurant_id;

  if not found then
    raise exception using errcode = '23503', message = 'Customer not found for restaurant';
  end if;

  if btrim(coalesce(v_customer.phone, '')) <> btrim(coalesce(v_order.customer_phone, '')) then
    raise exception using errcode = '23514', message = 'Order and customer do not match';
  end if;

  select pc.* into v_campaign
  from public.promotion_campaigns pc
  where pc.restaurant_id = p_restaurant_id
    and pc.kind = 'roulette'
    and pc.status = 'active'
    and pc.starts_at <= now()
    and pc.ends_at > now()
  order by pc.created_at desc, pc.id desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  if v_order.created_at < v_campaign.starts_at
    or v_order.created_at >= v_campaign.ends_at then
    return;
  end if;

  select count(*)::integer,
         coalesce(sum(o.total), 0)
    into v_order_count, v_spend_total
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.customer_phone = v_customer.phone
    and coalesce(o.is_test, false) = false
    and o.status <> 'canceled'
    and o.created_at <= v_order.created_at;

  v_spend_before := greatest(v_spend_total - coalesce(v_order.total, 0), 0);
  v_local_order_time := timezone('America/Sao_Paulo', v_order.created_at);

  for v_rule in
    select er.*
    from public.promotion_eligibility_rules er
    where er.campaign_id = v_campaign.id
      and er.restaurant_id = p_restaurant_id
      and er.enabled
    order by er.created_at, er.id
  loop
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

    if v_rule.rule_type in ('schedule', 'customer_spin_limit') then
      if not v_rule_ok then
        return;
      end if;
    else
      v_unlock_rule_count := v_unlock_rule_count + 1;
      if v_rule_ok then
        v_unlock_passed := true;
        if v_primary_rule_id is null then
          v_primary_rule_id := v_rule.id;
        end if;
      end if;
    end if;
  end loop;

  if v_unlock_rule_count = 0 or not v_unlock_passed then
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
    select s.* into v_spin
    from public.promotion_spins s
    where s.restaurant_id = p_restaurant_id
      and s.idempotency_key = 'campaign:' || v_campaign.id::text || ':order:' || p_order_id::text;
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
