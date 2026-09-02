-- Connect the admin lucky-wheel configurator to the promotion persistence model.
-- The save RPC runs as the authenticated caller, so existing tenant RLS remains authoritative.

create or replace function public.save_promotion_wheel_campaign(
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
  v_campaign_id uuid := p_campaign_id;
  v_name text;
  v_status text;
  v_mode text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_max_awards integer;
  v_budget_limit numeric;
  v_auto_pause boolean;
  v_rule jsonb;
  v_prize jsonb;
  v_prize_id uuid;
  v_prize_type text;
  v_product_id uuid;
  v_kept_prize_ids uuid[] := array[]::uuid[];
  v_existing_rule record;
  v_existing_prize record;
  v_probability_total numeric;
  v_frequency_total numeric;
  v_active_prizes integer;
  v_winning_prizes integer;
  v_no_prize_count integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if jsonb_typeof(coalesce(p_campaign, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_prizes, '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid campaign payload';
  end if;

  if not exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'Restaurant membership required';
  end if;

  v_name := btrim(coalesce(p_campaign ->> 'name', ''));
  v_status := coalesce(nullif(p_campaign ->> 'status', ''), 'draft');
  v_mode := coalesce(nullif(p_campaign ->> 'distribution_mode', ''), 'probability');
  v_starts_at := nullif(p_campaign ->> 'starts_at', '')::timestamptz;
  v_ends_at := nullif(p_campaign ->> 'ends_at', '')::timestamptz;
  v_max_awards := nullif(p_campaign ->> 'max_awards', '')::integer;
  v_budget_limit := nullif(p_campaign ->> 'budget_limit', '')::numeric;
  v_auto_pause := coalesce((p_campaign ->> 'auto_pause_on_limit')::boolean, true);

  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception using errcode = '23514', message = 'Campaign name must have between 3 and 80 characters';
  end if;
  if v_status not in ('draft','scheduled','active','paused','ended') then
    raise exception using errcode = '23514', message = 'Invalid campaign status';
  end if;
  if v_mode not in ('probability','frequency') then
    raise exception using errcode = '23514', message = 'Invalid distribution mode';
  end if;
  if v_starts_at is null or v_ends_at is null or v_ends_at <= v_starts_at then
    raise exception using errcode = '23514', message = 'Campaign dates are invalid';
  end if;

  if v_status = 'active' then
    update public.promotion_campaigns pc
    set status = 'paused'
    where pc.restaurant_id = p_restaurant_id
      and pc.kind = 'roulette'
      and pc.status = 'active'
      and (v_campaign_id is null or pc.id <> v_campaign_id);
  end if;

  if v_campaign_id is null then
    insert into public.promotion_campaigns (
      restaurant_id, kind, name, status, starts_at, ends_at, distribution_mode,
      max_awards, budget_limit, auto_pause_on_limit, created_by
    ) values (
      p_restaurant_id, 'roulette', v_name, v_status, v_starts_at, v_ends_at, v_mode,
      v_max_awards, v_budget_limit, v_auto_pause, (select auth.uid())
    ) returning id into v_campaign_id;
  else
    update public.promotion_campaigns pc
    set name = v_name,
        status = v_status,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        distribution_mode = v_mode,
        max_awards = v_max_awards,
        budget_limit = v_budget_limit,
        auto_pause_on_limit = v_auto_pause
    where pc.id = v_campaign_id
      and pc.restaurant_id = p_restaurant_id
      and pc.kind = 'roulette';
    if not found then
      raise exception using errcode = '23503', message = 'Campaign not found for restaurant';
    end if;
  end if;

  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    if coalesce(v_rule ->> 'rule_type', '') not in (
      'completed_order','minimum_order','every_orders','spend_threshold','first_purchase','schedule','customer_spin_limit'
    ) then
      raise exception using errcode = '23514', message = 'Invalid eligibility rule type';
    end if;

    insert into public.promotion_eligibility_rules (
      restaurant_id, campaign_id, rule_type, enabled, threshold_amount, threshold_count,
      weekdays, start_time, end_time, max_spins, limit_period
    ) values (
      p_restaurant_id,
      v_campaign_id,
      v_rule ->> 'rule_type',
      coalesce((v_rule ->> 'enabled')::boolean, true),
      nullif(v_rule ->> 'threshold_amount', '')::numeric,
      nullif(v_rule ->> 'threshold_count', '')::integer,
      case when jsonb_typeof(v_rule -> 'weekdays') = 'array'
        then array(select jsonb_array_elements_text(v_rule -> 'weekdays')::smallint)
        else null end,
      nullif(v_rule ->> 'start_time', '')::time,
      nullif(v_rule ->> 'end_time', '')::time,
      nullif(v_rule ->> 'max_spins', '')::integer,
      nullif(v_rule ->> 'limit_period', '')
    )
    on conflict (campaign_id, rule_type) do update
    set enabled = excluded.enabled,
        threshold_amount = excluded.threshold_amount,
        threshold_count = excluded.threshold_count,
        weekdays = excluded.weekdays,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        max_spins = excluded.max_spins,
        limit_period = excluded.limit_period,
        updated_at = now();
  end loop;

  for v_existing_rule in
    select er.id, er.rule_type
    from public.promotion_eligibility_rules er
    where er.restaurant_id = p_restaurant_id
      and er.campaign_id = v_campaign_id
      and not exists (
        select 1 from jsonb_array_elements(p_rules) candidate
        where candidate ->> 'rule_type' = er.rule_type
      )
  loop
    if exists (select 1 from public.promotion_spins s where s.eligibility_rule_id = v_existing_rule.id) then
      update public.promotion_eligibility_rules set enabled = false, updated_at = now()
      where id = v_existing_rule.id;
    else
      delete from public.promotion_eligibility_rules where id = v_existing_rule.id;
    end if;
  end loop;

  for v_prize in select value from jsonb_array_elements(p_prizes)
  loop
    v_prize_type := coalesce(v_prize ->> 'prize_type', '');
    if v_prize_type not in ('percent','fixed','free_shipping','free_product','no_prize') then
      raise exception using errcode = '23514', message = 'Invalid prize type';
    end if;

    v_product_id := null;
    if v_prize_type = 'free_product' then
      v_product_id := nullif(v_prize ->> 'product_id', '')::uuid;
      if v_product_id is null or not exists (
        select 1 from public.products p
        where p.id = v_product_id and p.restaurant_id = p_restaurant_id and p.is_active = true
      ) then
        raise exception using errcode = '23514', message = 'Free product prize must reference an active restaurant product';
      end if;
    end if;

    v_prize_id := null;
    begin
      v_prize_id := nullif(v_prize ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      v_prize_id := null;
    end;

    if v_prize_id is not null and exists (
      select 1 from public.promotion_prizes pp
      where pp.id = v_prize_id and pp.restaurant_id = p_restaurant_id and pp.campaign_id = v_campaign_id
    ) then
      update public.promotion_prizes pp
      set prize_type = v_prize_type,
          label = btrim(coalesce(v_prize ->> 'label', '')),
          percentage_value = case when v_prize_type = 'percent' then nullif(v_prize ->> 'percentage_value', '')::numeric else null end,
          fixed_amount = case when v_prize_type = 'fixed' then nullif(v_prize ->> 'fixed_amount', '')::numeric else null end,
          product_id = v_product_id,
          probability = case when v_mode = 'probability' then nullif(v_prize ->> 'probability', '')::numeric else null end,
          frequency_every = case when v_mode = 'frequency' and v_prize_type <> 'no_prize' then nullif(v_prize ->> 'frequency_every', '')::integer else null end,
          quantity_limit = case when v_prize_type <> 'no_prize' then nullif(v_prize ->> 'quantity_limit', '')::integer else null end,
          per_customer_limit = case when v_prize_type <> 'no_prize' then nullif(v_prize ->> 'per_customer_limit', '')::integer else null end,
          reward_validity_minutes = case when v_prize_type <> 'no_prize' then nullif(v_prize ->> 'reward_validity_minutes', '')::integer else null end,
          active = coalesce((v_prize ->> 'active')::boolean, true),
          sort_order = coalesce(nullif(v_prize ->> 'sort_order', '')::integer, 0),
          updated_at = now()
      where pp.id = v_prize_id;
    else
      insert into public.promotion_prizes (
        restaurant_id, campaign_id, prize_type, label, percentage_value, fixed_amount, product_id,
        probability, frequency_every, quantity_limit, per_customer_limit, reward_validity_minutes, active, sort_order
      ) values (
        p_restaurant_id,
        v_campaign_id,
        v_prize_type,
        btrim(coalesce(v_prize ->> 'label', '')),
        case when v_prize_type = 'percent' then nullif(v_prize ->> 'percentage_value', '')::numeric else null end,
        case when v_prize_type = 'fixed' then nullif(v_prize ->> 'fixed_amount', '')::numeric else null end,
        v_product_id,
        case when v_mode = 'probability' then nullif(v_prize ->> 'probability', '')::numeric else null end,
        case when v_mode = 'frequency' and v_prize_type <> 'no_prize' then nullif(v_prize ->> 'frequency_every', '')::integer else null end,
        case when v_prize_type <> 'no_prize' then nullif(v_prize ->> 'quantity_limit', '')::integer else null end,
        case when v_prize_type <> 'no_prize' then nullif(v_prize ->> 'per_customer_limit', '')::integer else null end,
        case when v_prize_type <> 'no_prize' then nullif(v_prize ->> 'reward_validity_minutes', '')::integer else null end,
        coalesce((v_prize ->> 'active')::boolean, true),
        coalesce(nullif(v_prize ->> 'sort_order', '')::integer, 0)
      ) returning id into v_prize_id;
    end if;
    v_kept_prize_ids := array_append(v_kept_prize_ids, v_prize_id);
  end loop;

  for v_existing_prize in
    select pp.id from public.promotion_prizes pp
    where pp.restaurant_id = p_restaurant_id
      and pp.campaign_id = v_campaign_id
      and not (pp.id = any(v_kept_prize_ids))
  loop
    if exists (select 1 from public.promotion_spin_results psr where psr.prize_id = v_existing_prize.id) then
      update public.promotion_prizes set active = false, updated_at = now() where id = v_existing_prize.id;
    else
      delete from public.promotion_prizes where id = v_existing_prize.id;
    end if;
  end loop;

  select count(*)::integer,
         count(*) filter (where pp.prize_type <> 'no_prize')::integer,
         count(*) filter (where pp.prize_type = 'no_prize')::integer
    into v_active_prizes, v_winning_prizes, v_no_prize_count
  from public.promotion_prizes pp
  where pp.restaurant_id = p_restaurant_id and pp.campaign_id = v_campaign_id and pp.active;

  if v_active_prizes < 2 or v_winning_prizes < 1 or v_no_prize_count > 1 then
    raise exception using errcode = '23514', message = 'Campaign must have at least two outcomes, one winning prize and at most one no-prize outcome';
  end if;

  if v_mode = 'probability' then
    select coalesce(sum(pp.probability), 0) into v_probability_total
    from public.promotion_prizes pp
    where pp.restaurant_id = p_restaurant_id and pp.campaign_id = v_campaign_id and pp.active;

    if abs(v_probability_total - 100) > 0.001 then
      raise exception using errcode = '23514', message = 'Prize probabilities must total 100';
    end if;
    if exists (
      select 1 from public.promotion_prizes pp
      where pp.restaurant_id = p_restaurant_id and pp.campaign_id = v_campaign_id and pp.active
        and (pp.probability is null or pp.probability <= 0)
    ) then
      raise exception using errcode = '23514', message = 'Every active prize must have a positive probability';
    end if;
  else
    if exists (
      select 1 from public.promotion_prizes pp
      where pp.restaurant_id = p_restaurant_id and pp.campaign_id = v_campaign_id and pp.active
        and pp.prize_type <> 'no_prize' and (pp.frequency_every is null or pp.frequency_every <= 0)
    ) then
      raise exception using errcode = '23514', message = 'Every winning prize must have a positive frequency';
    end if;

    select coalesce(sum(100.0 / pp.frequency_every), 0) into v_frequency_total
    from public.promotion_prizes pp
    where pp.restaurant_id = p_restaurant_id and pp.campaign_id = v_campaign_id and pp.active
      and pp.prize_type <> 'no_prize';

    if v_frequency_total > 100.001 then
      raise exception using errcode = '23514', message = 'Prize frequencies exceed 100 percent';
    end if;
    if v_frequency_total < 99.999 and v_no_prize_count = 0 then
      raise exception using errcode = '23514', message = 'Frequency mode requires a no-prize fallback when winning frequencies do not fill 100 percent';
    end if;
  end if;

  if not exists (
    select 1 from public.promotion_eligibility_rules er
    where er.restaurant_id = p_restaurant_id and er.campaign_id = v_campaign_id and er.enabled
      and er.rule_type in ('completed_order','minimum_order','every_orders','spend_threshold','first_purchase')
  ) then
    raise exception using errcode = '23514', message = 'Campaign needs at least one unlock rule';
  end if;

  return v_campaign_id;
end;
$$;

revoke all on function public.save_promotion_wheel_campaign(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_promotion_wheel_campaign(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

-- Eligibility semantics: unlock rules are alternatives (OR), while schedule and customer limits are guards (AND).
create or replace function public.grant_eligible_promotion_spin(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_order_id uuid
)
returns table (spin_id uuid, campaign_id uuid, campaign_name text, customer_id uuid)
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
  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.restaurant_id = p_restaurant_id for share;
  if not found then raise exception using errcode = '23503', message = 'Order not found for restaurant'; end if;
  if coalesce(v_order.is_test, false) then return; end if;

  select c.* into v_customer from public.customers c
  where c.id = p_customer_id and c.restaurant_id = p_restaurant_id;
  if not found then raise exception using errcode = '23503', message = 'Customer not found for restaurant'; end if;
  if btrim(coalesce(v_customer.phone, '')) <> btrim(coalesce(v_order.customer_phone, '')) then
    raise exception using errcode = '23514', message = 'Order and customer do not match';
  end if;

  select pc.* into v_campaign from public.promotion_campaigns pc
  where pc.restaurant_id = p_restaurant_id
    and pc.kind = 'roulette'
    and pc.status = 'active'
    and pc.starts_at <= now()
    and pc.ends_at > now()
  order by pc.created_at desc, pc.id desc limit 1 for update;
  if not found then return; end if;

  select count(*)::integer, coalesce(sum(o.total), 0)
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
    select er.* from public.promotion_eligibility_rules er
    where er.campaign_id = v_campaign.id and er.restaurant_id = p_restaurant_id and er.enabled
    order by er.created_at, er.id
  loop
    v_rule_ok := false;
    case v_rule.rule_type
      when 'completed_order' then v_rule_ok := v_order.status <> 'canceled';
      when 'minimum_order' then v_rule_ok := coalesce(v_order.subtotal, v_order.total, 0) >= coalesce(v_rule.threshold_amount, 0);
      when 'every_orders' then v_rule_ok := v_rule.threshold_count is not null and v_rule.threshold_count > 0 and v_order_count > 0 and mod(v_order_count, v_rule.threshold_count) = 0;
      when 'spend_threshold' then v_rule_ok := v_rule.threshold_amount is not null and v_rule.threshold_amount > 0 and floor(v_spend_total / v_rule.threshold_amount) > floor(v_spend_before / v_rule.threshold_amount);
      when 'first_purchase' then v_rule_ok := v_order_count = 1;
      when 'schedule' then v_rule_ok := extract(dow from v_local_order_time)::smallint = any(v_rule.weekdays) and v_local_order_time::time >= v_rule.start_time and v_local_order_time::time < v_rule.end_time;
      when 'customer_spin_limit' then
        if v_rule.limit_period = 'day' then
          v_period_start := date_trunc('day', v_local_order_time) at time zone 'America/Sao_Paulo';
        elsif v_rule.limit_period = 'week' then
          v_period_start := date_trunc('week', v_local_order_time) at time zone 'America/Sao_Paulo';
        else
          v_period_start := v_campaign.starts_at;
        end if;
        select count(*)::integer into v_existing_spins from public.promotion_spins s
        where s.restaurant_id = p_restaurant_id and s.campaign_id = v_campaign.id
          and s.customer_id = p_customer_id and s.created_at >= coalesce(v_period_start, v_campaign.starts_at);
        v_rule_ok := v_existing_spins < coalesce(v_rule.max_spins, 0);
      else v_rule_ok := false;
    end case;

    v_rule_results := v_rule_results || jsonb_build_object(
      v_rule.rule_type,
      jsonb_build_object('passed', v_rule_ok, 'rule_id', v_rule.id, 'threshold_amount', v_rule.threshold_amount,
        'threshold_count', v_rule.threshold_count, 'max_spins', v_rule.max_spins, 'limit_period', v_rule.limit_period)
    );

    if v_rule.rule_type in ('schedule', 'customer_spin_limit') then
      if not v_rule_ok then return; end if;
    else
      v_unlock_rule_count := v_unlock_rule_count + 1;
      if v_rule_ok then
        v_unlock_passed := true;
        if v_primary_rule_id is null then v_primary_rule_id := v_rule.id; end if;
      end if;
    end if;
  end loop;

  if v_unlock_rule_count = 0 or not v_unlock_passed then return; end if;

  insert into public.promotion_spins (
    restaurant_id, campaign_id, customer_id, source_order_id, eligibility_rule_id, idempotency_key, eligibility_snapshot
  ) values (
    p_restaurant_id, v_campaign.id, p_customer_id, p_order_id, v_primary_rule_id,
    'campaign:' || v_campaign.id::text || ':order:' || p_order_id::text,
    jsonb_build_object('evaluated_at', now(), 'order_count', v_order_count, 'spend_total', v_spend_total,
      'order_total', v_order.total, 'rules', v_rule_results)
  )
  on conflict (restaurant_id, idempotency_key) do nothing
  returning * into v_spin;

  if not found then
    select s.* into v_spin from public.promotion_spins s
    where s.restaurant_id = p_restaurant_id
      and s.idempotency_key = 'campaign:' || v_campaign.id::text || ':order:' || p_order_id::text;
  end if;
  if v_spin.status <> 'pending' then return; end if;

  spin_id := v_spin.id;
  campaign_id := v_campaign.id;
  campaign_name := v_campaign.name;
  customer_id := p_customer_id;
  return next;
end;
$$;

revoke all on function public.grant_eligible_promotion_spin(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_eligible_promotion_spin(uuid, uuid, uuid) to service_role;
