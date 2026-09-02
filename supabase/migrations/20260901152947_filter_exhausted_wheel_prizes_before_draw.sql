-- Remove exhausted prizes from the effective draw before a result is persisted.
-- When a no-prize segment exists, unavailable weight is routed to it.

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
  v_fallback public.promotion_prizes%rowtype;
  v_existing_result public.promotion_spin_results%rowtype;
  v_config_total numeric := 0;
  v_total_weight numeric := 0;
  v_eligible_weight numeric := 0;
  v_unavailable_weight numeric := 0;
  v_fallback_weight numeric := 0;
  v_roll numeric := 0;
  v_campaign_awards integer := 0;
  v_result_id uuid;
  v_reward_id uuid;
  v_reward_expires_at timestamptz;
begin
  select s.* into v_spin
  from public.promotion_spins s
  where s.id = p_spin_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Promotion spin not found';
  end if;

  if v_spin.status = 'resolved' then
    select psr.* into v_existing_result
    from public.promotion_spin_results psr
    where psr.spin_id = v_spin.id;

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

  select pc.* into v_campaign
  from public.promotion_campaigns pc
  where pc.id = v_spin.campaign_id
    and pc.restaurant_id = v_spin.restaurant_id
  for update;

  if not found
    or v_campaign.status <> 'active'
    or v_campaign.starts_at > now()
    or v_campaign.ends_at <= now() then
    raise exception using errcode = '55000', message = 'Promotion campaign is not active';
  end if;

  select count(*)::integer into v_campaign_awards
  from public.promotion_spin_results r
  where r.campaign_id = v_spin.campaign_id
    and r.prize_type <> 'no_prize';

  select p.* into v_fallback
  from public.promotion_prizes p
  where p.restaurant_id = v_spin.restaurant_id
    and p.campaign_id = v_spin.campaign_id
    and p.active
    and p.prize_type = 'no_prize'
  order by p.sort_order, p.id
  limit 1;

  if v_campaign.max_awards is not null
    and v_campaign_awards >= v_campaign.max_awards
    and v_campaign.auto_pause_on_limit then
    update public.promotion_campaigns pc
    set status = 'paused'
    where pc.id = v_campaign.id
      and pc.restaurant_id = v_campaign.restaurant_id;
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
      into v_config_total
    from public.promotion_prizes p
    where p.restaurant_id = v_spin.restaurant_id
      and p.campaign_id = v_spin.campaign_id
      and p.active;

    if abs(v_config_total - 100) > 0.01 then
      raise exception using errcode = '23514', message = 'Probability campaign must total 100 percent';
    end if;

    with prize_state as (
      select
        p.*,
        case
          when p.prize_type = 'no_prize' then true
          when v_campaign.max_awards is not null and v_campaign_awards >= v_campaign.max_awards then false
          when p.quantity_limit is not null and (
            select count(*) from public.promotion_spin_results r
            where r.prize_id = p.id and r.prize_type <> 'no_prize'
          ) >= p.quantity_limit then false
          when p.per_customer_limit is not null and (
            select count(*) from public.promotion_spin_results r
            where r.prize_id = p.id
              and r.customer_id = v_spin.customer_id
              and r.prize_type <> 'no_prize'
          ) >= p.per_customer_limit then false
          else true
        end as eligible
      from public.promotion_prizes p
      where p.restaurant_id = v_spin.restaurant_id
        and p.campaign_id = v_spin.campaign_id
        and p.active
    )
    select
      coalesce(sum(case when ps.eligible then ps.probability else 0 end), 0),
      coalesce(sum(case when not ps.eligible then ps.probability else 0 end), 0)
      into v_eligible_weight, v_unavailable_weight
    from prize_state ps;

    if v_fallback.id is not null then
      v_total_weight := v_eligible_weight + v_unavailable_weight;
      v_roll := random() * v_total_weight;

      with prize_state as (
        select
          p.*,
          case
            when p.prize_type = 'no_prize' then true
            when v_campaign.max_awards is not null and v_campaign_awards >= v_campaign.max_awards then false
            when p.quantity_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id and r.prize_type <> 'no_prize'
            ) >= p.quantity_limit then false
            when p.per_customer_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id
                and r.customer_id = v_spin.customer_id
                and r.prize_type <> 'no_prize'
            ) >= p.per_customer_limit then false
            else true
          end as eligible
        from public.promotion_prizes p
        where p.restaurant_id = v_spin.restaurant_id
          and p.campaign_id = v_spin.campaign_id
          and p.active
      ), weighted as (
        select
          ps.id,
          ps.sort_order,
          sum(
            ps.probability
            + case when ps.id = v_fallback.id then v_unavailable_weight else 0 end
          ) over (order by ps.sort_order, ps.id) as cumulative_weight
        from prize_state ps
        where ps.eligible
      )
      select p.* into v_prize
      from weighted w
      join public.promotion_prizes p on p.id = w.id
      where w.cumulative_weight > v_roll
      order by w.sort_order, w.id
      limit 1;
    else
      v_total_weight := v_eligible_weight;
      if v_total_weight <= 0 then
        update public.promotion_spins s
        set status = 'expired'
        where s.id = v_spin.id and s.status = 'pending';
        return;
      end if;

      v_roll := random() * v_total_weight;
      with prize_state as (
        select
          p.*,
          case
            when v_campaign.max_awards is not null and v_campaign_awards >= v_campaign.max_awards then false
            when p.quantity_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id and r.prize_type <> 'no_prize'
            ) >= p.quantity_limit then false
            when p.per_customer_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id
                and r.customer_id = v_spin.customer_id
                and r.prize_type <> 'no_prize'
            ) >= p.per_customer_limit then false
            else true
          end as eligible
        from public.promotion_prizes p
        where p.restaurant_id = v_spin.restaurant_id
          and p.campaign_id = v_spin.campaign_id
          and p.active
      ), weighted as (
        select
          ps.id,
          ps.sort_order,
          sum(ps.probability) over (order by ps.sort_order, ps.id) as cumulative_weight
        from prize_state ps
        where ps.eligible
      )
      select p.* into v_prize
      from weighted w
      join public.promotion_prizes p on p.id = w.id
      where w.cumulative_weight > v_roll
      order by w.sort_order, w.id
      limit 1;
    end if;
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
      into v_config_total
    from public.promotion_prizes p
    where p.restaurant_id = v_spin.restaurant_id
      and p.campaign_id = v_spin.campaign_id
      and p.active
      and p.prize_type <> 'no_prize';

    if v_config_total > 100.0001 then
      raise exception using errcode = '23514', message = 'Frequency campaign exceeds 100 percent effective probability';
    end if;

    with prize_state as (
      select
        p.*,
        case
          when p.prize_type = 'no_prize' then true
          when v_campaign.max_awards is not null and v_campaign_awards >= v_campaign.max_awards then false
          when p.quantity_limit is not null and (
            select count(*) from public.promotion_spin_results r
            where r.prize_id = p.id and r.prize_type <> 'no_prize'
          ) >= p.quantity_limit then false
          when p.per_customer_limit is not null and (
            select count(*) from public.promotion_spin_results r
            where r.prize_id = p.id
              and r.customer_id = v_spin.customer_id
              and r.prize_type <> 'no_prize'
          ) >= p.per_customer_limit then false
          else true
        end as eligible
      from public.promotion_prizes p
      where p.restaurant_id = v_spin.restaurant_id
        and p.campaign_id = v_spin.campaign_id
        and p.active
    )
    select
      coalesce(sum(case when ps.eligible and ps.prize_type <> 'no_prize' then 100.0 / ps.frequency_every else 0 end), 0),
      coalesce(sum(case when not ps.eligible and ps.prize_type <> 'no_prize' then 100.0 / ps.frequency_every else 0 end), 0)
      into v_eligible_weight, v_unavailable_weight
    from prize_state ps;

    if v_fallback.id is not null then
      v_fallback_weight := greatest(0, 100 - v_config_total) + v_unavailable_weight;
      v_total_weight := v_eligible_weight + v_fallback_weight;
      v_roll := random() * v_total_weight;

      with prize_state as (
        select
          p.*,
          case
            when p.prize_type = 'no_prize' then true
            when v_campaign.max_awards is not null and v_campaign_awards >= v_campaign.max_awards then false
            when p.quantity_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id and r.prize_type <> 'no_prize'
            ) >= p.quantity_limit then false
            when p.per_customer_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id
                and r.customer_id = v_spin.customer_id
                and r.prize_type <> 'no_prize'
            ) >= p.per_customer_limit then false
            else true
          end as eligible
        from public.promotion_prizes p
        where p.restaurant_id = v_spin.restaurant_id
          and p.campaign_id = v_spin.campaign_id
          and p.active
      ), effective as (
        select
          ps.id,
          ps.sort_order,
          case
            when ps.id = v_fallback.id then v_fallback_weight
            when ps.prize_type <> 'no_prize' and ps.eligible then 100.0 / ps.frequency_every
            else 0
          end as effective_weight
        from prize_state ps
        where ps.eligible
      ), weighted as (
        select
          e.id,
          e.sort_order,
          sum(e.effective_weight) over (order by e.sort_order, e.id) as cumulative_weight
        from effective e
        where e.effective_weight > 0
      )
      select p.* into v_prize
      from weighted w
      join public.promotion_prizes p on p.id = w.id
      where w.cumulative_weight > v_roll
      order by w.sort_order, w.id
      limit 1;
    else
      if v_config_total < 99.999 then
        raise exception using errcode = '23514', message = 'Frequency campaign needs a no-prize fallback';
      end if;

      v_total_weight := v_eligible_weight;
      if v_total_weight <= 0 then
        update public.promotion_spins s
        set status = 'expired'
        where s.id = v_spin.id and s.status = 'pending';
        return;
      end if;

      v_roll := random() * v_total_weight;
      with prize_state as (
        select
          p.*,
          case
            when v_campaign.max_awards is not null and v_campaign_awards >= v_campaign.max_awards then false
            when p.quantity_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id and r.prize_type <> 'no_prize'
            ) >= p.quantity_limit then false
            when p.per_customer_limit is not null and (
              select count(*) from public.promotion_spin_results r
              where r.prize_id = p.id
                and r.customer_id = v_spin.customer_id
                and r.prize_type <> 'no_prize'
            ) >= p.per_customer_limit then false
            else true
          end as eligible
        from public.promotion_prizes p
        where p.restaurant_id = v_spin.restaurant_id
          and p.campaign_id = v_spin.campaign_id
          and p.active
          and p.prize_type <> 'no_prize'
      ), weighted as (
        select
          ps.id,
          ps.sort_order,
          sum(100.0 / ps.frequency_every) over (order by ps.sort_order, ps.id) as cumulative_weight
        from prize_state ps
        where ps.eligible
      )
      select p.* into v_prize
      from weighted w
      join public.promotion_prizes p on p.id = w.id
      where w.cumulative_weight > v_roll
      order by w.sort_order, w.id
      limit 1;
    end if;
  end if;

  if v_prize.id is null then
    update public.promotion_spins s
    set status = 'expired'
    where s.id = v_spin.id and s.status = 'pending';
    return;
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
    'v2',
    jsonb_build_object(
      'roll', round(v_roll, 6),
      'configured_total', round(v_config_total, 6),
      'effective_total', round(v_total_weight, 6),
      'unavailable_weight', round(v_unavailable_weight, 6),
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
