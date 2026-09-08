-- Shifuh loyalty secure redemption foundation.
-- Loyalty keeps its own point ledger and redemption audit while checkout benefits are unified later.

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
    from jsonb_array_elements(
      case
        when jsonb_typeof(p_addons) = 'array' then p_addons
        else '[]'::jsonb
      end
    ) addon_group
    where lower(coalesce(addon_group ->> 'required', 'false')) = 'true'
       or (
         btrim(coalesce(addon_group ->> 'min_options', '')) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
         and btrim(coalesce(addon_group ->> 'min_options', '')) !~ '^-'
         and split_part(lower(btrim(coalesce(addon_group ->> 'min_options', ''))), 'e', 1) ~ '[1-9]'
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

    perform pg_advisory_xact_lock(
      hashtextextended('promotion-free-product:' || new.product_id::text, 0)
    );

    select p.addons into v_addons
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
    perform pg_advisory_xact_lock(
      hashtextextended('promotion-free-product:' || new.product_id::text, 0)
    );

    select p.addons into v_addons
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
  perform pg_advisory_xact_lock(
    hashtextextended('promotion-free-product:' || new.id::text, 0)
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

comment on table public.loyalty_redemptions is
  'Restaurant-scoped loyalty benefit issuance audit created after an atomic point debit.';
