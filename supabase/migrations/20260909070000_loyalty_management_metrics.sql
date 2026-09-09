-- Shifuh loyalty management metrics.
-- Aggregation stays tenant-scoped and authenticated; raw loyalty rows are not exposed by this RPC.

create index if not exists loyalty_transactions_program_type_created_idx
  on public.loyalty_point_transactions (restaurant_id, program_id, transaction_type, created_at desc);

create index if not exists loyalty_redemptions_program_created_idx
  on public.loyalty_redemptions (restaurant_id, program_id, created_at desc);

create index if not exists loyalty_redemptions_program_status_redeemed_idx
  on public.loyalty_redemptions (restaurant_id, program_id, status, redeemed_at desc)
  where redeemed_at is not null;

create or replace function public.get_loyalty_management_metrics(
  p_restaurant_id uuid,
  p_period_days integer default 30
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_program_name text;
  v_program_status text;
  v_period_start timestamptz;
  v_trend_start timestamptz;
  v_bucket text;

  v_participants bigint := 0;
  v_new_participants bigint := 0;
  v_customers_with_balance bigint := 0;
  v_points_in_circulation bigint := 0;
  v_points_issued_period bigint := 0;
  v_points_redeemed_period bigint := 0;
  v_points_expired_period bigint := 0;
  v_points_issued_all_time bigint := 0;
  v_points_redeemed_all_time bigint := 0;
  v_points_expired_all_time bigint := 0;
  v_redeem_rate numeric := 0;

  v_rewards_issued_period bigint := 0;
  v_rewards_used_period bigint := 0;
  v_rewards_available bigint := 0;

  v_earning_orders bigint := 0;
  v_earning_orders_revenue numeric := 0;
  v_redemption_orders bigint := 0;
  v_redemption_orders_revenue numeric := 0;

  v_trend jsonb := '[]'::jsonb;
  v_reward_performance jsonb := '[]'::jsonb;
  v_top_customers jsonb := '[]'::jsonb;
begin
  if p_restaurant_id is null then
    raise exception using errcode = '22023', message = 'Restaurant is required';
  end if;

  if p_period_days not in (0, 30, 90, 180, 365) then
    raise exception using errcode = '22023', message = 'Unsupported loyalty metrics period';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Restaurant membership required';
  end if;

  select lp.id, lp.name, lp.status
  into v_program_id, v_program_name, v_program_status
  from public.loyalty_programs lp
  where lp.restaurant_id = p_restaurant_id
  limit 1;

  if v_program_id is null then
    return jsonb_build_object(
      'program', null,
      'period', jsonb_build_object('days', p_period_days, 'start', null, 'bucket', 'day', 'trendStart', null),
      'metrics', jsonb_build_object(
        'participants', 0,
        'newParticipants', 0,
        'customersWithBalance', 0,
        'pointsInCirculation', 0,
        'pointsIssuedPeriod', 0,
        'pointsRedeemedPeriod', 0,
        'pointsExpiredPeriod', 0,
        'pointsIssuedAllTime', 0,
        'pointsRedeemedAllTime', 0,
        'pointsExpiredAllTime', 0,
        'redemptionRatePct', 0,
        'rewardsIssuedPeriod', 0,
        'rewardsUsedPeriod', 0,
        'rewardsAvailable', 0,
        'earningOrdersPeriod', 0,
        'earningOrdersRevenue', 0,
        'redemptionOrdersPeriod', 0,
        'redemptionOrdersRevenue', 0
      ),
      'trend', '[]'::jsonb,
      'rewards', '[]'::jsonb,
      'topCustomers', '[]'::jsonb
    );
  end if;

  v_period_start := case
    when p_period_days = 0 then null
    else now() - make_interval(days => p_period_days)
  end;

  v_bucket := case
    when p_period_days = 0 then 'month'
    when p_period_days <= 30 then 'day'
    when p_period_days <= 180 then 'week'
    else 'month'
  end;

  v_trend_start := case
    when p_period_days = 0 then now() - interval '730 days'
    else v_period_start
  end;

  select
    count(*),
    count(*) filter (where la.points_balance > 0),
    coalesce(sum(la.points_balance), 0),
    count(*) filter (where v_period_start is null or la.created_at >= v_period_start)
  into
    v_participants,
    v_customers_with_balance,
    v_points_in_circulation,
    v_new_participants
  from public.loyalty_accounts la
  where la.restaurant_id = p_restaurant_id
    and la.program_id = v_program_id;

  select
    coalesce(sum(case when lpt.points_delta > 0 then lpt.points_delta else 0 end), 0),
    coalesce(sum(case when lpt.transaction_type = 'redeem' then abs(lpt.points_delta) else 0 end), 0),
    coalesce(sum(case when lpt.transaction_type = 'expire' then abs(lpt.points_delta) else 0 end), 0),
    coalesce(sum(case when (v_period_start is null or lpt.created_at >= v_period_start) and lpt.points_delta > 0 then lpt.points_delta else 0 end), 0),
    coalesce(sum(case when (v_period_start is null or lpt.created_at >= v_period_start) and lpt.transaction_type = 'redeem' then abs(lpt.points_delta) else 0 end), 0),
    coalesce(sum(case when (v_period_start is null or lpt.created_at >= v_period_start) and lpt.transaction_type = 'expire' then abs(lpt.points_delta) else 0 end), 0)
  into
    v_points_issued_all_time,
    v_points_redeemed_all_time,
    v_points_expired_all_time,
    v_points_issued_period,
    v_points_redeemed_period,
    v_points_expired_period
  from public.loyalty_point_transactions lpt
  where lpt.restaurant_id = p_restaurant_id
    and lpt.program_id = v_program_id;

  v_redeem_rate := case
    when v_points_issued_all_time > 0
      then round((v_points_redeemed_all_time::numeric / v_points_issued_all_time::numeric) * 100, 1)
    else 0
  end;

  select
    count(*) filter (where v_period_start is null or lr.created_at >= v_period_start),
    count(*) filter (
      where lr.status = 'redeemed'
        and (v_period_start is null or lr.redeemed_at >= v_period_start)
    ),
    count(*) filter (
      where lr.status = 'available'
        and (lr.expires_at is null or lr.expires_at > now())
    )
  into
    v_rewards_issued_period,
    v_rewards_used_period,
    v_rewards_available
  from public.loyalty_redemptions lr
  where lr.restaurant_id = p_restaurant_id
    and lr.program_id = v_program_id;

  select count(*), coalesce(sum(earned_order.total), 0)
  into v_earning_orders, v_earning_orders_revenue
  from (
    select distinct o.id, o.total
    from public.loyalty_point_transactions lpt
    join public.orders o
      on o.id = lpt.source_order_id
     and o.restaurant_id = lpt.restaurant_id
    where lpt.restaurant_id = p_restaurant_id
      and lpt.program_id = v_program_id
      and lpt.transaction_type = 'earn'
      and lpt.source_order_id is not null
      and (v_period_start is null or lpt.created_at >= v_period_start)
      and o.status = 'done'
      and coalesce(o.is_test, false) = false
  ) earned_order;

  select count(*), coalesce(sum(redeemed_order.total), 0)
  into v_redemption_orders, v_redemption_orders_revenue
  from (
    select distinct o.id, o.total
    from public.loyalty_redemptions lr
    join public.orders o
      on o.id = lr.redeemed_order_id
     and o.restaurant_id = lr.restaurant_id
    where lr.restaurant_id = p_restaurant_id
      and lr.program_id = v_program_id
      and lr.status = 'redeemed'
      and lr.redeemed_order_id is not null
      and (v_period_start is null or lr.redeemed_at >= v_period_start)
      and o.status = 'done'
      and coalesce(o.is_test, false) = false
  ) redeemed_order;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'period', trend_row.bucket,
        'earned', trend_row.earned,
        'redeemed', trend_row.redeemed
      )
      order by trend_row.bucket
    ),
    '[]'::jsonb
  )
  into v_trend
  from (
    select
      date_trunc(v_bucket, lpt.created_at) as bucket,
      coalesce(sum(case when lpt.points_delta > 0 then lpt.points_delta else 0 end), 0) as earned,
      coalesce(sum(case when lpt.transaction_type = 'redeem' then abs(lpt.points_delta) else 0 end), 0) as redeemed
    from public.loyalty_point_transactions lpt
    where lpt.restaurant_id = p_restaurant_id
      and lpt.program_id = v_program_id
      and lpt.created_at >= v_trend_start
    group by date_trunc(v_bucket, lpt.created_at)
  ) trend_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', reward_row.id,
        'name', reward_row.name,
        'type', reward_row.reward_type,
        'pointsCost', reward_row.points_cost,
        'active', reward_row.active,
        'totalRedemptions', reward_row.total_redemptions,
        'periodRedemptions', reward_row.period_redemptions,
        'totalUsed', reward_row.total_used,
        'periodUsed', reward_row.period_used,
        'pointsSpent', reward_row.points_spent
      )
      order by reward_row.period_redemptions desc, reward_row.total_redemptions desc, reward_row.name
    ),
    '[]'::jsonb
  )
  into v_reward_performance
  from (
    select
      rw.id,
      rw.name,
      rw.reward_type,
      rw.points_cost,
      rw.active,
      count(rd.id) as total_redemptions,
      count(rd.id) filter (where v_period_start is null or rd.created_at >= v_period_start) as period_redemptions,
      count(rd.id) filter (where rd.status = 'redeemed') as total_used,
      count(rd.id) filter (
        where rd.status = 'redeemed'
          and (v_period_start is null or rd.redeemed_at >= v_period_start)
      ) as period_used,
      coalesce(sum(rd.points_spent), 0) as points_spent
    from public.loyalty_rewards rw
    left join public.loyalty_redemptions rd
      on rd.reward_id = rw.id
     and rd.restaurant_id = rw.restaurant_id
     and rd.program_id = rw.program_id
    where rw.restaurant_id = p_restaurant_id
      and rw.program_id = v_program_id
    group by rw.id, rw.name, rw.reward_type, rw.points_cost, rw.active
  ) reward_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'customerId', customer_row.customer_id,
        'phone', customer_row.phone,
        'balance', customer_row.points_balance,
        'lifetimeEarned', customer_row.lifetime_earned,
        'lifetimeRedeemed', customer_row.lifetime_redeemed
      )
      order by customer_row.lifetime_earned desc, customer_row.points_balance desc
    ),
    '[]'::jsonb
  )
  into v_top_customers
  from (
    select
      la.customer_id,
      c.phone,
      la.points_balance,
      la.lifetime_earned,
      la.lifetime_redeemed
    from public.loyalty_accounts la
    join public.customers c
      on c.id = la.customer_id
     and c.restaurant_id = la.restaurant_id
    where la.restaurant_id = p_restaurant_id
      and la.program_id = v_program_id
    order by la.lifetime_earned desc, la.points_balance desc
    limit 5
  ) customer_row;

  return jsonb_build_object(
    'program', jsonb_build_object(
      'id', v_program_id,
      'name', v_program_name,
      'status', v_program_status
    ),
    'period', jsonb_build_object(
      'days', p_period_days,
      'start', v_period_start,
      'bucket', v_bucket,
      'trendStart', v_trend_start
    ),
    'metrics', jsonb_build_object(
      'participants', v_participants,
      'newParticipants', v_new_participants,
      'customersWithBalance', v_customers_with_balance,
      'pointsInCirculation', v_points_in_circulation,
      'pointsIssuedPeriod', v_points_issued_period,
      'pointsRedeemedPeriod', v_points_redeemed_period,
      'pointsExpiredPeriod', v_points_expired_period,
      'pointsIssuedAllTime', v_points_issued_all_time,
      'pointsRedeemedAllTime', v_points_redeemed_all_time,
      'pointsExpiredAllTime', v_points_expired_all_time,
      'redemptionRatePct', v_redeem_rate,
      'rewardsIssuedPeriod', v_rewards_issued_period,
      'rewardsUsedPeriod', v_rewards_used_period,
      'rewardsAvailable', v_rewards_available,
      'earningOrdersPeriod', v_earning_orders,
      'earningOrdersRevenue', v_earning_orders_revenue,
      'redemptionOrdersPeriod', v_redemption_orders,
      'redemptionOrdersRevenue', v_redemption_orders_revenue
    ),
    'trend', v_trend,
    'rewards', v_reward_performance,
    'topCustomers', v_top_customers
  );
end;
$$;

revoke all on function public.get_loyalty_management_metrics(uuid, integer)
from public, anon;
grant execute on function public.get_loyalty_management_metrics(uuid, integer)
to authenticated, service_role;

comment on function public.get_loyalty_management_metrics(uuid, integer) is
  'Tenant-scoped loyalty dashboard aggregation for authenticated restaurant members. Revenue values are contextual order totals, not causal attribution.';
