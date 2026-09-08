-- Shifuh loyalty secure redemption and checkout consumption.
-- Points are exchanged for a dedicated loyalty redemption instance. The instance is then
-- consumed atomically by checkout, without pretending the benefit originated from a wheel spin.

create unique index if not exists loyalty_rewards_id_restaurant_program_uidx
  on public.loyalty_rewards (id, restaurant_id, program_id);

create table public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  program_id uuid not null,
  account_id uuid not null,
  customer_id uuid not null,
  reward_id uuid not null,
  reward_type text not null,
  label text not null,
  points_spent bigint not null,
  balance_after bigint not null,
  percentage_value numeric(5,2),
  fixed_amount numeric(12,2),
  product_id uuid,
  minimum_order_amount numeric(12,2) not null default 0,
  status text not null default 'available',
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_order_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loyalty_redemptions_reward_fkey
    foreign key (reward_id, restaurant_id, program_id)
    references public.loyalty_rewards(id, restaurant_id, program_id)
    on delete restrict,
  constraint loyalty_redemptions_account_fkey
    foreign key (account_id, restaurant_id, program_id, customer_id)
    references public.loyalty_accounts(id, restaurant_id, program_id, customer_id)
    on delete restrict,
  constraint loyalty_redemptions_product_fkey
    foreign key (product_id, restaurant_id)
    references public.products(id, restaurant_id)
    on delete restrict,
  constraint loyalty_redemptions_order_fkey
    foreign key (redeemed_order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete restrict,
  constraint loyalty_redemptions_id_tenant_key unique (id, restaurant_id),
  constraint loyalty_redemptions_tenant_idempotency_key unique (restaurant_id, idempotency_key),
  constraint loyalty_redemptions_type_check check (
    reward_type in ('percent','fixed','free_shipping','free_product')
  ),
  constraint loyalty_redemptions_points_check check (points_spent > 0),
  constraint loyalty_redemptions_balance_check check (balance_after >= 0),
  constraint loyalty_redemptions_minimum_order_check check (minimum_order_amount >= 0),
  constraint loyalty_redemptions_status_check check (
    status in ('available','redeemed','expired','cancelled')
  ),
  constraint loyalty_redemptions_idempotency_check check (
    char_length(btrim(idempotency_key)) between 8 and 180
  ),
  constraint loyalty_redemptions_value_shape_check check (
    (
      reward_type = 'percent'
      and percentage_value is not null
      and percentage_value > 0
      and percentage_value <= 100
      and fixed_amount is null
      and product_id is null
    )
    or
    (
      reward_type = 'fixed'
      and fixed_amount is not null
      and fixed_amount > 0
      and percentage_value is null
      and product_id is null
    )
    or
    (
      reward_type = 'free_shipping'
      and percentage_value is null
      and fixed_amount is null
      and product_id is null
    )
    or
    (
      reward_type = 'free_product'
      and product_id is not null
      and percentage_value is null
      and fixed_amount is null
    )
  ),
  constraint loyalty_redemptions_redeemed_shape_check check (
    (status = 'redeemed' and redeemed_at is not null and redeemed_order_id is not null)
    or (status <> 'redeemed' and redeemed_at is null and redeemed_order_id is null)
  )
);

create index loyalty_redemptions_customer_status_idx
  on public.loyalty_redemptions (restaurant_id, customer_id, status, created_at desc);
create index loyalty_redemptions_reward_created_idx
  on public.loyalty_redemptions (reward_id, created_at desc);
create index loyalty_redemptions_order_idx
  on public.loyalty_redemptions (restaurant_id, redeemed_order_id)
  where redeemed_order_id is not null;
create index loyalty_redemptions_expiry_idx
  on public.loyalty_redemptions (restaurant_id, expires_at)
  where status = 'available' and expires_at is not null;

create trigger loyalty_redemptions_set_updated_at
before update on public.loyalty_redemptions
for each row execute function public.set_updated_at();

alter table public.loyalty_redemptions enable row level security;

revoke all on table public.loyalty_redemptions from public, anon, authenticated;
grant select on table public.loyalty_redemptions to authenticated;
grant all on table public.loyalty_redemptions to service_role;

create policy "Members read loyalty redemptions"
on public.loyalty_redemptions
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = loyalty_redemptions.restaurant_id
      and rm.user_id = (select auth.uid())
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
         and pg_catalog.btrim(pg_catalog.coalesce(addon_group ->> 'min_options', '')) !~ '-^'
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

create or replace function public.guard_loyalty_free_product_reward_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_addons jsonb;
begin
  if coalesce(new.active, true) and new.reward_type = 'free_product' then
    if new.product_id is null then
      raise exception using errcode = '23514', message = 'Free product loyalty reward must reference an active restaurant product';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('promotion-free-product:' || new.product_id::text, 0)
    );

    select p.addons
      into v_addons
      from public.products p
     where p.id = new.product_id
       and p.restaurant_id = new.restaurant_id
       and p.is_active = true;

    if not found then
      raise exception using errcode = '23514', message = 'Free product loyalty reward must reference an active restaurant product';
    end if;

    if app_private.loyalty_reward_product_requires_options(v_addons) then
      raise exception using errcode = '23514', message = 'Free product loyalty reward cannot reference a product with required add-ons';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_loyalty_free_product_reward_configuration()
from public, anon, authenticated;

create or replace function public.guard_available_loyalty_free_product_redemption()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_addons jsonb;
begin
  if new.status = 'available' and new.reward_type = 'free_product' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('promotion-free-product:' || new.product_id::text, 0)
    );

    select p.addons
      into v_addons
      from public.products p
     where p.id = new.product_id
       and p.restaurant_id = new.restaurant_id
       and p.is_active = true;

    if not found then
      raise exception using errcode = '23514', message = 'Available loyalty free-product redemption requires an active restaurant product';
    end if;

    if app_private.loyalty_reward_product_requires_options(v_addons) then
      raise exception using errcode = '23514', message = 'Available loyalty free-product redemption cannot require add-on choices';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_available_loyalty_free_product_redemption()
from public, anon, authenticated;

-- Deactivate any legacy catalog entry that cannot be fulfilled safely before installing the guard.
with product_state as (
  select
    p.id,
    p.restaurant_id,
    p.is_active,
    app_private.loyalty_reward_product_requires_options(p.addons) as requires_options
  from public.products p
)
update public.loyalty_rewards lr
set active = false,
    updated_at = now()
from product_state ps
where lr.product_id = ps.id
  and lr.restaurant_id = ps.restaurant_id
  and lr.reward_type = 'free_product'
  and lr.active = true
  and (ps.is_active = false or ps.requires_options);

drop trigger if exists loyalty_rewards_guard_free_product on public.loyalty_rewards;
create trigger loyalty_rewards_guard_free_product
before insert or update of reward_type, product_id, active, restaurant_id
on public.loyalty_rewards
for each row execute function public.guard_loyalty_free_product_reward_configuration();

drop trigger if exists loyalty_redemptions_guard_free_product on public.loyalty_redemptions;
create trigger loyalty_redemptions_guard_free_product
before insert or update of reward_type, product_id, status, expires_at, restaurant_id
on public.loyalty_redemptions
for each row execute function public.guard_available_loyalty_free_product_redemption();

-- Preserve the existing product protection and extend it to loyalty catalog/redemption dependencies.
create or replace function public.guard_product_required_addons_for_active_rewards()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requires_options boolean := false;
  v_has_dependency boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('promotion-free-product:' || new.id::text, 0)
  );

  v_requires_options := app_private.loyalty_reward_product_requires_options(new.addons);

  if coalesce(new.is_active, false) = false or v_requires_options then
    v_has_dependency := exists (
      select 1
      from public.promotion_prizes pp
      where pp.restaurant_id = new.restaurant_id
        and pp.product_id = new.id
        and pp.prize_type = 'free_product'
        and pp.active = true
    ) or exists (
      select 1
      from public.customer_rewards cr
      where cr.restaurant_id = new.restaurant_id
        and cr.product_id = new.id
        and cr.reward_type = 'free_product'
        and cr.status = 'available'
        and (cr.expires_at is null or cr.expires_at > now())
    ) or exists (
      select 1
      from public.loyalty_rewards lr
      where lr.restaurant_id = new.restaurant_id
        and lr.product_id = new.id
        and lr.reward_type = 'free_product'
        and lr.active = true
    ) or exists (
      select 1
      from public.loyalty_redemptions lrd
      where lrd.restaurant_id = new.restaurant_id
        and lrd.product_id = new.id
        and lrd.reward_type = 'free_product'
        and lrd.status = 'available'
        and (lrd.expires_at is null or lrd.expires_at > now())
    );

    if v_has_dependency then
      if coalesce(new.is_active, false) = false then
        raise exception using errcode = '23514', message = 'Product cannot be deactivated while used by an active or issued free-product reward';
      end if;

      raise exception using errcode = '23514', message = 'Product cannot require add-ons while used by an active or issued free-product reward';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_product_required_addons_for_active_rewards()
from public, anon, authenticated;

create or replace function public.redeem_loyalty_reward(
  p_reward_id uuid,
  p_customer_phone text,
  p_idempotency_key text
)
returns table (
  redemption_id uuid,
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
  v_redemption_id uuid := gen_random_uuid();
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

    redemption_id := v_existing.id;
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
      'reward_id', v_reward.id,
      'reward_name', v_reward.name,
      'points_cost', v_reward.points_cost
    )
  )
  returning loyalty_point_transactions.balance_after into v_balance_after;

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

  redemption_id := v_redemption_id;
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

create or replace function public.create_storefront_order_with_loyalty_redemption_transaction(
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
  p_redemption_id uuid
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
security definer
set search_path = ''
as $$
declare
  v_existing_order public.orders%rowtype;
  v_redemption public.loyalty_redemptions%rowtype;
  v_customer public.customers%rowtype;
  v_product public.products%rowtype;
  v_created record;
  v_items jsonb := pg_catalog.coalesce(p_items, '[]'::jsonb);
  v_discount numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_idempotency_key text := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_idempotency_key, '')));
  v_phone text := pg_catalog.regexp_replace(pg_catalog.coalesce(p_customer_phone, ''), '\D', '', 'g');
begin
  if p_redemption_id is null then
    raise exception using errcode = '22023', message = 'Loyalty redemption is required';
  end if;

  if v_idempotency_key = '' or char_length(v_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'Valid idempotency key is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_restaurant_id::text || ':order:' || v_idempotency_key, 0)
  );

  select o.* into v_existing_order
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.idempotency_key = v_idempotency_key;

  if found then
    select lrd.* into v_redemption
    from public.loyalty_redemptions lrd
    where lrd.redeemed_order_id = v_existing_order.id
      and lrd.restaurant_id = p_restaurant_id
    limit 1;

    if not found or v_redemption.id <> p_redemption_id then
      raise exception using errcode = '23514', message = 'Order idempotency key already used with different reward';
    end if;

    order_id := v_existing_order.id;
    display_number := v_existing_order.display_number;
    reward_discount := pg_catalog.coalesce(v_existing_order.discount, 0);
    order_total := v_existing_order.total;
    reward_id := v_redemption.id;
    reward_type := v_redemption.reward_type;
    reward_label := v_redemption.label;
    return next;
    return;
  end if;

  select lrd.* into v_redemption
  from public.loyalty_redemptions lrd
  where lrd.id = p_redemption_id
    and lrd.restaurant_id = p_restaurant_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'Loyalty redemption not found';
  end if;

  if v_redemption.status = 'redeemed' then
    if v_redemption.redeemed_order_id is not null then
      select o.* into v_existing_order
      from public.orders o
      where o.id = v_redemption.redeemed_order_id
        and o.restaurant_id = p_restaurant_id
        and o.idempotency_key = v_idempotency_key;

      if found then
        order_id := v_existing_order.id;
        display_number := v_existing_order.display_number;
        reward_discount := pg_catalog.coalesce(v_existing_order.discount, 0);
        order_total := v_existing_order.total;
        reward_id := v_redemption.id;
        reward_type := v_redemption.reward_type;
        reward_label := v_redemption.label;
        return next;
        return;
      end if;
    end if;
    raise exception using errcode = '23514', message = 'Reward has already been redeemed';
  end if;

  if v_redemption.status <> 'available' then
    raise exception using errcode = '23514', message = 'Reward is unavailable';
  end if;

  if v_redemption.expires_at is not null and v_redemption.expires_at <= now() then
    raise exception using errcode = '23514', message = 'Reward is expired';
  end if;

  if pg_catalog.round(pg_catalog.coalesce(p_subtotal, 0)::numeric, 2) < v_redemption.minimum_order_amount then
    raise exception using errcode = '23514', message = 'Reward minimum order amount not reached';
  end if;

  select c.* into v_customer
  from public.customers c
  where c.id = v_redemption.customer_id
    and c.restaurant_id = p_restaurant_id;

  if not found or pg_catalog.regexp_replace(pg_catalog.coalesce(v_customer.phone, ''), '\D', '', 'g') <> v_phone then
    raise exception using errcode = '42501', message = 'Reward does not belong to this customer';
  end if;

  if v_redemption.reward_type = 'percent' then
    v_discount := pg_catalog.least(
      pg_catalog.round(pg_catalog.coalesce(p_subtotal, 0)::numeric * pg_catalog.coalesce(v_redemption.percentage_value, 0) / 100, 2),
      pg_catalog.round(pg_catalog.coalesce(p_subtotal, 0)::numeric, 2)
    );
  elsif v_redemption.reward_type = 'fixed' then
    v_discount := pg_catalog.least(
      pg_catalog.round(pg_catalog.coalesce(v_redemption.fixed_amount, 0)::numeric, 2),
      pg_catalog.round(pg_catalog.coalesce(p_subtotal, 0)::numeric, 2)
    );
  elsif v_redemption.reward_type = 'free_shipping' then
    if pg_catalog.coalesce(p_address ->> 'fulfillment_type', 'delivery') <> 'delivery'
      or pg_catalog.coalesce(p_delivery_fee, 0) <= 0 then
      raise exception using errcode = '23514', message = 'Free shipping reward requires a paid delivery';
    end if;
    v_discount := pg_catalog.round(pg_catalog.coalesce(p_delivery_fee, 0)::numeric, 2);
  elsif v_redemption.reward_type = 'free_product' then
    select p.* into v_product
    from public.products p
    where p.id = v_redemption.product_id
      and p.restaurant_id = p_restaurant_id
      and p.is_active = true;

    if not found or app_private.loyalty_reward_product_requires_options(v_product.addons) then
      raise exception using errcode = '23514', message = 'Free product reward is unavailable';
    end if;

    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_name', v_product.name,
      'quantity', 1,
      'price', 0,
      'observation', 'Recompensa do Programa de Fidelidade',
      'addons', '[]'::jsonb
    ));
  else
    raise exception using errcode = '23514', message = 'Unsupported reward type';
  end if;

  v_total := pg_catalog.greatest(
    pg_catalog.round(pg_catalog.coalesce(p_subtotal, 0)::numeric, 2)
      + pg_catalog.round(pg_catalog.coalesce(p_delivery_fee, 0)::numeric, 2)
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
    p_subtotal => pg_catalog.round(pg_catalog.coalesce(p_subtotal, 0)::numeric, 2),
    p_delivery_fee => pg_catalog.round(pg_catalog.coalesce(p_delivery_fee, 0)::numeric, 2),
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

  update public.loyalty_redemptions lrd
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_order_id = v_created.order_id,
      updated_at = now()
  where lrd.id = v_redemption.id
    and lrd.status = 'available';

  if not found then
    raise exception using errcode = '55000', message = 'Reward could not be redeemed';
  end if;

  order_id := v_created.order_id;
  display_number := v_created.display_number;
  reward_discount := v_discount;
  order_total := v_total;
  reward_id := v_redemption.id;
  reward_type := v_redemption.reward_type;
  reward_label := v_redemption.label;
  return next;
end;
$$;

revoke all on function public.create_storefront_order_with_loyalty_redemption_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, uuid, timestamptz, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_storefront_order_with_loyalty_redemption_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, uuid, timestamptz, boolean, text, uuid
) to service_role;

comment on table public.loyalty_redemptions is
  'Issued loyalty benefits created after an atomic point debit. Kept separate from roulette customer_rewards.';
comment on function public.redeem_loyalty_reward(uuid, text, text) is
  'Atomically validates a loyalty catalog reward, debits the customer wallet and creates an idempotent benefit instance.';
comment on function public.create_storefront_order_with_loyalty_redemption_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, text, text, uuid, timestamptz, boolean, text, uuid
) is
  'Atomically consumes an issued loyalty benefit while creating the storefront order; the point debit already occurred at exchange time.';
