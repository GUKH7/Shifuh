-- Shifuh loyalty automatic earning.
-- Awards points exactly once when an eligible order reaches done, regardless of the channel
-- that changed the status. Loyalty remains independent from roulette/coupon campaign tables.

-- Harden the immutable ledger so duplicate idempotency keys are discarded before the
-- balance side effect runs. This makes future server-side earn/redeem processors safe to retry.
create or replace function app_private.prepare_loyalty_point_transaction()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.loyalty_accounts%rowtype;
  v_new_balance bigint;
  v_idempotency_key text;
begin
  select * into v_account
  from public.loyalty_accounts
  where id = new.account_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Loyalty account not found';
  end if;

  v_idempotency_key := btrim(coalesce(new.idempotency_key, ''));
  if char_length(v_idempotency_key) < 8 or char_length(v_idempotency_key) > 180 then
    raise exception using errcode = '22023', message = 'Invalid loyalty idempotency key';
  end if;

  -- Serialize the same logical operation even when two different workers retry it together.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_account.restaurant_id::text || ':' || v_idempotency_key, 0)
  );

  if exists (
    select 1
    from public.loyalty_point_transactions lpt
    where lpt.restaurant_id = v_account.restaurant_id
      and lpt.idempotency_key = v_idempotency_key
  ) then
    return null;
  end if;

  new.restaurant_id := v_account.restaurant_id;
  new.program_id := v_account.program_id;
  new.customer_id := v_account.customer_id;
  new.idempotency_key := v_idempotency_key;
  new.created_at := now();

  if pg_catalog.jsonb_typeof(new.metadata) <> 'object' then
    raise exception using errcode = '22023', message = 'Loyalty transaction metadata must be a JSON object';
  end if;

  v_new_balance := v_account.points_balance + new.points_delta;
  if v_new_balance < 0 then
    raise exception using errcode = '23514', message = 'Insufficient loyalty points';
  end if;

  new.balance_after := v_new_balance;

  update public.loyalty_accounts
  set
    points_balance = v_new_balance,
    lifetime_earned = lifetime_earned + case when new.transaction_type = 'earn' then new.points_delta else 0 end,
    lifetime_redeemed = lifetime_redeemed + case when new.transaction_type = 'redeem' then abs(new.points_delta) else 0 end,
    lifetime_expired = lifetime_expired + case when new.transaction_type = 'expire' then abs(new.points_delta) else 0 end
  where id = v_account.id;

  return new;
end;
$$;

revoke all on function app_private.prepare_loyalty_point_transaction() from public, anon, authenticated;

create or replace function app_private.award_loyalty_points_for_completed_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.loyalty_programs%rowtype;
  v_customer public.customers%rowtype;
  v_account_id uuid;
  v_phone text;
  v_eligible_spend numeric(12,2);
  v_points bigint := 0;
  v_expires_at timestamptz;
  v_idempotency_key text;
  v_order_label text;
begin
  if new.status <> 'done' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'done' then
    return new;
  end if;

  if coalesce(new.is_test, false) then
    return new;
  end if;

  select * into v_program
  from public.loyalty_programs lp
  where lp.restaurant_id = new.restaurant_id
    and lp.status = 'active'
  limit 1;

  if not found then
    return new;
  end if;

  -- Points are earned on merchandise actually eligible after order-level discounts.
  -- Delivery fees never increase the point base.
  v_eligible_spend := greatest(
    round(coalesce(new.subtotal, 0)::numeric - coalesce(new.discount, 0)::numeric, 2),
    0::numeric
  );

  if v_eligible_spend < coalesce(v_program.minimum_order_amount, 0) then
    return new;
  end if;

  if v_program.earning_mode = 'spend' then
    if coalesce(v_program.spend_amount, 0) <= 0 or coalesce(v_program.points_per_spend, 0) <= 0 then
      return new;
    end if;

    v_points := pg_catalog.floor(v_eligible_spend / v_program.spend_amount)::bigint
      * v_program.points_per_spend::bigint;
  elsif v_program.earning_mode = 'order' then
    v_points := coalesce(v_program.points_per_order, 0)::bigint;
  end if;

  if v_points <= 0 then
    return new;
  end if;

  v_phone := pg_catalog.regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g');
  if v_phone = '' then
    return new;
  end if;

  -- Prefer the exact phone row, but tolerate historical formatting differences.
  select c.* into v_customer
  from public.customers c
  where c.restaurant_id = new.restaurant_id
    and pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone
  order by
    case when c.phone = new.customer_phone then 0 else 1 end,
    c.updated_at desc,
    c.created_at desc
  limit 1;

  if not found then
    insert into public.customers (
      restaurant_id,
      phone,
      name,
      address_json
    ) values (
      new.restaurant_id,
      v_phone,
      nullif(btrim(new.customer_name), ''),
      coalesce(new.address, '{}'::jsonb)
    )
    on conflict (restaurant_id, phone) do update
    set
      name = coalesce(excluded.name, public.customers.name),
      address_json = coalesce(excluded.address_json, public.customers.address_json),
      updated_at = now()
    returning * into v_customer;
  end if;

  insert into public.loyalty_accounts (
    restaurant_id,
    program_id,
    customer_id
  ) values (
    new.restaurant_id,
    v_program.id,
    v_customer.id
  )
  on conflict (program_id, customer_id) do nothing;

  select la.id into v_account_id
  from public.loyalty_accounts la
  where la.program_id = v_program.id
    and la.customer_id = v_customer.id;

  if v_account_id is null then
    raise exception using errcode = '23503', message = 'Unable to resolve loyalty account';
  end if;

  v_idempotency_key := 'loyalty:earn:order:' || new.id::text || ':program:' || v_program.id::text;

  if exists (
    select 1
    from public.loyalty_point_transactions lpt
    where lpt.restaurant_id = new.restaurant_id
      and lpt.idempotency_key = v_idempotency_key
  ) then
    return new;
  end if;

  if v_program.points_validity_days is not null then
    v_expires_at := now() + pg_catalog.make_interval(days => v_program.points_validity_days);
  end if;

  v_order_label := coalesce(new.display_number::text, left(new.id::text, 8));

  insert into public.loyalty_point_transactions (
    account_id,
    restaurant_id,
    program_id,
    customer_id,
    transaction_type,
    points_delta,
    balance_after,
    source_order_id,
    idempotency_key,
    description,
    expires_at,
    metadata
  ) values (
    v_account_id,
    new.restaurant_id,
    v_program.id,
    v_customer.id,
    'earn',
    v_points,
    0,
    new.id,
    v_idempotency_key,
    'Pontos do pedido #' || v_order_label,
    v_expires_at,
    pg_catalog.jsonb_build_object(
      'earning_mode', v_program.earning_mode,
      'eligible_spend', v_eligible_spend,
      'subtotal', coalesce(new.subtotal, 0),
      'discount', coalesce(new.discount, 0),
      'total', coalesce(new.total, 0),
      'display_number', new.display_number,
      'external_source', new.external_source
    )
  );

  return new;
end;
$$;

revoke all on function app_private.award_loyalty_points_for_completed_order() from public, anon, authenticated;

-- AFTER makes the credit part of the same transaction as the final order state. A failure does
-- not silently lose points: the completion can be retried safely because the ledger is idempotent.
drop trigger if exists orders_award_loyalty_points on public.orders;
create trigger orders_award_loyalty_points
after insert or update of status on public.orders
for each row
when (new.status = 'done')
execute function app_private.award_loyalty_points_for_completed_order();

comment on function app_private.award_loyalty_points_for_completed_order() is
  'Credits the active restaurant loyalty program exactly once when an eligible non-test order reaches done.';
