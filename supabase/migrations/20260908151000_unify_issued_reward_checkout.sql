-- Unify issued benefits at checkout without mixing their source-specific audit trails.
-- customer_rewards becomes the generic checkout benefit wallet; roulette keeps spin references,
-- while loyalty keeps its own redemption + point ledger and links one issued benefit instance.

alter table public.customer_rewards
  add column if not exists source_type text not null default 'roulette',
  add column if not exists loyalty_redemption_id uuid;

alter table public.customer_rewards
  alter column campaign_id drop not null,
  alter column spin_id drop not null,
  alter column spin_result_id drop not null,
  alter column prize_id drop not null;

create unique index if not exists customer_rewards_loyalty_redemption_uidx
  on public.customer_rewards (loyalty_redemption_id)
  where loyalty_redemption_id is not null;

alter table public.customer_rewards
  add constraint customer_rewards_loyalty_redemption_fkey
  foreign key (loyalty_redemption_id, restaurant_id)
  references public.loyalty_redemptions(id, restaurant_id)
  on delete restrict;

alter table public.customer_rewards
  add constraint customer_rewards_source_type_check
  check (source_type in ('roulette','loyalty'));

alter table public.customer_rewards
  add constraint customer_rewards_source_shape_check
  check (
    (
      source_type = 'roulette'
      and campaign_id is not null
      and spin_id is not null
      and spin_result_id is not null
      and prize_id is not null
      and loyalty_redemption_id is null
    )
    or
    (
      source_type = 'loyalty'
      and campaign_id is null
      and spin_id is null
      and spin_result_id is null
      and prize_id is null
      and loyalty_redemption_id is not null
    )
  );

create or replace function app_private.loyalty_reward_product_requires_options(p_addons jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      case
        when pg_catalog.jsonb_typeof(p_addons) = 'array' then p_addons
        else '[]'::jsonb
      end
    ) addon_group
    where pg_catalog.lower(pg_catalog.coalesce(addon_group ->> 'required', 'false')) = 'true'
       or (
         pg_catalog.btrim(pg_catalog.coalesce(addon_group ->> 'min_options', '')) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
         and pg_catalog.btrim(pg_catalog.coalesce(addon_group ->> 'min_options', '')) !~ '^-'
         and pg_catalog.split_part(
           pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(addon_group ->> 'min_options', ''))),
           'e',
           1
         ) ~ '[1-9]'
       )
  );
$$;

revoke all on function app_private.loyalty_reward_product_requires_options(jsonb)
from public, anon, authenticated;

create or replace function app_private.sync_loyalty_redemption_from_customer_reward()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_type <> 'loyalty' or new.loyalty_redemption_id is null then
    return new;
  end if;

  update public.loyalty_redemptions lrd
  set
    status = new.status,
    redeemed_at = new.redeemed_at,
    redeemed_order_id = new.redeemed_order_id,
    updated_at = now()
  where lrd.id = new.loyalty_redemption_id
    and lrd.restaurant_id = new.restaurant_id;

  if not found then
    raise exception using errcode = '23503', message = 'Linked loyalty redemption not found';
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_loyalty_redemption_from_customer_reward()
from public, anon, authenticated;

drop trigger if exists customer_rewards_sync_loyalty_redemption on public.customer_rewards;
create trigger customer_rewards_sync_loyalty_redemption
after update of status, redeemed_at, redeemed_order_id
on public.customer_rewards
for each row
when (new.source_type = 'loyalty')
execute function app_private.sync_loyalty_redemption_from_customer_reward();

-- The generic customer reward row is the checkout-facing benefit. The loyalty redemption remains
-- the immutable source/audit link proving which catalog item and point debit created it.
drop function if exists public.redeem_loyalty_reward(uuid, text, text);

create function public.redeem_loyalty_reward(
  p_reward_id uuid,
  p_customer_phone text,
  p_idempotency_key text
)
returns table (
  redemption_id uuid,
  benefit_id uuid,
  restaurant_id uuid,
  program_id uuid,
  reward_id uuid,
  reward_type text,
  reward_label text,
  points_spent bigint,
  balance_after bigint,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward public.loyalty_rewards%rowtype;
  v_program public.loyalty_programs%rowtype;
  v_customer public.customers%rowtype;
  v_account public.loyalty_accounts%rowtype;
  v_existing public.loyalty_redemptions%rowtype;
  v_existing_benefit public.customer_rewards%rowtype;
  v_redemption_id uuid := gen_random_uuid();
  v_benefit_id uuid := gen_random_uuid();
  v_idempotency_key text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_idempotency_key, '')));
  v_phone text := pg_catalog.regexp_replace(pg_catalog.coalesce(p_customer_phone, ''), '\D', '', 'g');
  v_redeemed_count bigint := 0;
  v_expires_at timestamptz;
  v_balance_after bigint;
  v_product_addons jsonb;
begin
  if p_reward_id is null then
    raise exception using errcode = '22023', message = 'Loyalty reward is required';
  end if;

  if char_length(v_idempotency_key) < 8 or char_length(v_idempotency_key) > 180 then
    raise exception using errcode = '22023', message = 'Valid loyalty redemption idempotency key is required';
  end if;

  if v_phone !~ '^\d{10,11}$' then
    raise exception using errcode = '22023', message = 'Valid customer phone is required';
  end if;

  select lr.* into v_reward
  from public.loyalty_rewards lr
  where lr.id = p_reward_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Loyalty reward not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_reward.restaurant_id::text || ':' || v_idempotency_key, 0)
  );

  select lrd.* into v_existing
  from public.loyalty_redemptions lrd
  where lrd.restaurant_id = v_reward.restaurant_id
    and lrd.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.reward_id <> v_reward.id then
      raise exception using errcode = '23514', message = 'Loyalty idempotency key already used with different reward';
    end if;

    select c.* into v_customer
    from public.customers c
    where c.id = v_existing.customer_id
      and c.restaurant_id = v_existing.restaurant_id;

    if not found or pg_catalog.regexp_replace(pg_catalog.coalesce(v_customer.phone, ''), '\D', '', 'g') <> v_phone then
      raise exception using errcode = '42501', message = 'Loyalty redemption does not belong to this customer';
    end if;

    select cr.* into v_existing_benefit
    from public.customer_rewards cr
    where cr.loyalty_redemption_id = v_existing.id
      and cr.restaurant_id = v_existing.restaurant_id;

    if not found then
      raise exception using errcode = '23503', message = 'Loyalty checkout benefit not found';
    end if;

    redemption_id := v_existing.id;
    benefit_id := v_existing_benefit.id;
    restaurant_id := v_existing.restaurant_id;
    program_id := v_existing.program_id;
    reward_id := v_existing.reward_id;
    reward_type := v_existing.reward_type;
    reward_label := v_existing.label;
    points_spent := v_existing.points_spent;
    balance_after := v_existing.balance_after;
    expires_at := v_existing.expires_at;
    return next;
    return;
  end if;

  if not v_reward.active then
    raise exception using errcode = '23514', message = 'Loyalty reward is unavailable';
  end if;

  select lp.* into v_program
  from public.loyalty_programs lp
  where lp.id = v_reward.program_id
    and lp.restaurant_id = v_reward.restaurant_id
  for share;

  if not found or v_program.status <> 'active' then
    raise exception using errcode = '23514', message = 'Loyalty program is not active';
  end if;

  select c.* into v_customer
  from public.customers c
  where c.restaurant_id = v_reward.restaurant_id
    and pg_catalog.regexp_replace(pg_catalog.coalesce(c.phone, ''), '\D', '', 'g') = v_phone
  order by c.updated_at desc, c.created_at desc
  limit 1;

  if not found then
    raise exception using errcode = '23503', message = 'Loyalty customer not found';
  end if;

  select la.* into v_account
  from public.loyalty_accounts la
  where la.program_id = v_reward.program_id
    and la.customer_id = v_customer.id
    and la.restaurant_id = v_reward.restaurant_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Loyalty account not found';
  end if;

  if v_account.points_balance < v_reward.points_cost then
    raise exception using errcode = '23514', message = 'Insufficient loyalty points';
  end if;

  if v_reward.max_redemptions_total is not null then
    select count(*)::bigint into v_redeemed_count
    from public.loyalty_redemptions lrd
    where lrd.reward_id = v_reward.id;

    if v_redeemed_count >= v_reward.max_redemptions_total then
      raise exception using errcode = '23514', message = 'Loyalty reward redemption limit reached';
    end if;
  end if;

  if v_reward.reward_type = 'free_product' then
    select p.addons into v_product_addons
    from public.products p
    where p.id = v_reward.product_id
      and p.restaurant_id = v_reward.restaurant_id
      and p.is_active = true;

    if not found or app_private.loyalty_reward_product_requires_options(v_product_addons) then
      raise exception using errcode = '23514', message = 'Loyalty free product reward is unavailable';
    end if;
  end if;

  if v_reward.reward_validity_days is not null then
    v_expires_at := now() + pg_catalog.make_interval(days => v_reward.reward_validity_days);
  end if;

  insert into public.loyalty_point_transactions (
    account_id,
    restaurant_id,
    program_id,
    customer_id,
    transaction_type,
    points_delta,
    balance_after,
    idempotency_key,
    description,
    metadata
  ) values (
    v_account.id,
    v_reward.restaurant_id,
    v_reward.program_id,
    v_customer.id,
    'redeem',
    -v_reward.points_cost::bigint,
    0,
    'loyalty:redeem:' || v_redemption_id::text,
    'Resgate: ' || v_reward.name,
    pg_catalog.jsonb_build_object(
      'redemption_id', v_redemption_id,
      'checkout_benefit_id', v_benefit_id,
      'reward_id', v_reward.id,
      'reward_name', v_reward.name,
      'points_cost', v_reward.points_cost
    )
  )
  returning balance_after into v_balance_after;

  insert into public.loyalty_redemptions (
    id,
    restaurant_id,
    program_id,
    account_id,
    customer_id,
    reward_id,
    reward_type,
    label,
    points_spent,
    balance_after,
    percentage_value,
    fixed_amount,
    product_id,
    minimum_order_amount,
    status,
    expires_at,
    idempotency_key
  ) values (
    v_redemption_id,
    v_reward.restaurant_id,
    v_reward.program_id,
    v_account.id,
    v_customer.id,
    v_reward.id,
    v_reward.reward_type,
    v_reward.name,
    v_reward.points_cost,
    v_balance_after,
    v_reward.percentage_value,
    v_reward.fixed_amount,
    v_reward.product_id,
    v_reward.minimum_order_amount,
    'available',
    v_expires_at,
    v_idempotency_key
  );

  insert into public.customer_rewards (
    id,
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
    status,
    expires_at,
    source_type,
    loyalty_redemption_id
  ) values (
    v_benefit_id,
    v_reward.restaurant_id,
    null,
    v_customer.id,
    null,
    null,
    null,
    v_reward.reward_type,
    v_reward.name,
    v_reward.percentage_value,
    v_reward.fixed_amount,
    v_reward.product_id,
    v_reward.minimum_order_amount,
    'available',
    v_expires_at,
    'loyalty',
    v_redemption_id
  );

  redemption_id := v_redemption_id;
  benefit_id := v_benefit_id;
  restaurant_id := v_reward.restaurant_id;
  program_id := v_reward.program_id;
  reward_id := v_reward.id;
  reward_type := v_reward.reward_type;
  reward_label := v_reward.name;
  points_spent := v_reward.points_cost;
  balance_after := v_balance_after;
  expires_at := v_expires_at;
  return next;
end;
$$;

revoke all on function public.redeem_loyalty_reward(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.redeem_loyalty_reward(uuid, text, text)
to service_role;

-- Loyalty now intentionally reuses the already-hardened customer_rewards checkout transaction.
-- Remove the temporary source-specific checkout RPC from the previous migration so there is one
-- canonical path for coupons/rewards idempotency and benefit consumption.
drop function if exists public.create_storefront_order_with_loyalty_redemption_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, uuid, timestamptz, boolean, text, uuid
);

comment on column public.customer_rewards.source_type is
  'Origin of the issued checkout benefit: roulette keeps wheel audit FKs; loyalty links loyalty_redemptions.';
comment on column public.customer_rewards.loyalty_redemption_id is
  'Source loyalty redemption whose atomic point debit issued this checkout benefit.';
