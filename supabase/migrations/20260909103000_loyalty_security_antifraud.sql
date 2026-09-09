-- Front 9: final loyalty security and anti-fraud invariants.
-- Issued loyalty redemptions and their generic checkout benefits are audit snapshots:
-- identity/value fields never change and terminal states never become available again.

create or replace function app_private.guard_loyalty_redemption_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_phone text;
  v_order_phone text;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Loyalty redemptions are immutable audit records';
  end if;

  if new.id is distinct from old.id
     or new.restaurant_id is distinct from old.restaurant_id
     or new.program_id is distinct from old.program_id
     or new.account_id is distinct from old.account_id
     or new.customer_id is distinct from old.customer_id
     or new.reward_id is distinct from old.reward_id
     or new.reward_type is distinct from old.reward_type
     or new.label is distinct from old.label
     or new.points_spent is distinct from old.points_spent
     or new.balance_after is distinct from old.balance_after
     or new.percentage_value is distinct from old.percentage_value
     or new.fixed_amount is distinct from old.fixed_amount
     or new.product_id is distinct from old.product_id
     or new.minimum_order_amount is distinct from old.minimum_order_amount
     or new.expires_at is distinct from old.expires_at
     or new.idempotency_key is distinct from old.idempotency_key
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '55000',
      message = 'Loyalty redemption audit fields are immutable';
  end if;

  if old.status <> 'available' and new.status <> old.status then
    raise exception using
      errcode = '23514',
      message = 'Terminal loyalty redemption status cannot transition';
  end if;

  if old.status = 'redeemed' and (
    new.redeemed_at is distinct from old.redeemed_at
    or new.redeemed_order_id is distinct from old.redeemed_order_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'Redeemed loyalty order linkage is immutable';
  end if;

  if old.status = 'available' and new.status = 'redeemed' then
    select pg_catalog.regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')
    into v_customer_phone
    from public.customers c
    where c.id = new.customer_id
      and c.restaurant_id = new.restaurant_id;

    select pg_catalog.regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g')
    into v_order_phone
    from public.orders o
    where o.id = new.redeemed_order_id
      and o.restaurant_id = new.restaurant_id;

    if v_customer_phone is null
       or v_order_phone is null
       or v_customer_phone = ''
       or v_customer_phone <> v_order_phone then
      raise exception using
        errcode = '42501',
        message = 'Redeemed loyalty order does not belong to this customer';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_loyalty_redemption_integrity()
from public, anon, authenticated;

drop trigger if exists loyalty_redemptions_guard_integrity on public.loyalty_redemptions;
create trigger loyalty_redemptions_guard_integrity
before update or delete on public.loyalty_redemptions
for each row execute function app_private.guard_loyalty_redemption_integrity();

create or replace function app_private.guard_loyalty_checkout_benefit_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redemption public.loyalty_redemptions%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.source_type = 'loyalty' then
      raise exception using
        errcode = '55000',
        message = 'Issued loyalty checkout benefits are immutable audit records';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (old.source_type = 'loyalty' or new.source_type = 'loyalty') then
    if new.id is distinct from old.id
       or new.restaurant_id is distinct from old.restaurant_id
       or new.customer_id is distinct from old.customer_id
       or new.source_type is distinct from old.source_type
       or new.loyalty_redemption_id is distinct from old.loyalty_redemption_id
       or new.reward_type is distinct from old.reward_type
       or new.label is distinct from old.label
       or new.percentage_value is distinct from old.percentage_value
       or new.fixed_amount is distinct from old.fixed_amount
       or new.product_id is distinct from old.product_id
       or new.minimum_order_amount is distinct from old.minimum_order_amount
       or new.expires_at is distinct from old.expires_at
       or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '55000',
        message = 'Issued loyalty checkout benefit fields are immutable';
    end if;

    if old.status <> 'available' and new.status <> old.status then
      raise exception using
        errcode = '23514',
        message = 'Terminal loyalty checkout benefit status cannot transition';
    end if;

    if old.status = 'redeemed' and (
      new.redeemed_at is distinct from old.redeemed_at
      or new.redeemed_order_id is distinct from old.redeemed_order_id
    ) then
      raise exception using
        errcode = '55000',
        message = 'Redeemed loyalty checkout order linkage is immutable';
    end if;
  end if;

  if new.source_type <> 'loyalty' then
    return new;
  end if;

  select lrd.* into v_redemption
  from public.loyalty_redemptions lrd
  where lrd.id = new.loyalty_redemption_id
    and lrd.restaurant_id = new.restaurant_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'Linked loyalty redemption not found';
  end if;

  if new.customer_id is distinct from v_redemption.customer_id
     or new.reward_type is distinct from v_redemption.reward_type
     or new.label is distinct from v_redemption.label
     or new.percentage_value is distinct from v_redemption.percentage_value
     or new.fixed_amount is distinct from v_redemption.fixed_amount
     or new.product_id is distinct from v_redemption.product_id
     or new.minimum_order_amount is distinct from v_redemption.minimum_order_amount
     or new.expires_at is distinct from v_redemption.expires_at then
    raise exception using
      errcode = '23514',
      message = 'Loyalty checkout benefit does not match its redemption snapshot';
  end if;

  if tg_op = 'INSERT' and (
    new.status is distinct from v_redemption.status
    or new.redeemed_at is distinct from v_redemption.redeemed_at
    or new.redeemed_order_id is distinct from v_redemption.redeemed_order_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Initial loyalty checkout benefit state does not match its redemption';
  end if;

  return new;
end;
$$;

revoke all on function app_private.guard_loyalty_checkout_benefit_integrity()
from public, anon, authenticated;

drop trigger if exists customer_rewards_guard_loyalty_integrity on public.customer_rewards;
create trigger customer_rewards_guard_loyalty_integrity
before insert or update or delete on public.customer_rewards
for each row execute function app_private.guard_loyalty_checkout_benefit_integrity();

-- Keep the privileged mutation surface explicit. Customer sessions may read only through
-- verified server routes; the point debit and phone discovery RPCs stay service-role-only.
revoke all on function public.redeem_loyalty_reward(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.redeem_loyalty_reward(uuid, text, text)
to service_role;

revoke all on function public.find_loyalty_customers_by_phone(text, uuid)
from public, anon, authenticated;
grant execute on function public.find_loyalty_customers_by_phone(text, uuid)
to service_role;

comment on function app_private.guard_loyalty_redemption_integrity() is
  'Prevents mutation/deletion of loyalty redemption audit snapshots and enforces irreversible status transitions.';
comment on function app_private.guard_loyalty_checkout_benefit_integrity() is
  'Keeps loyalty-origin customer_rewards bound to the exact issued redemption and prevents benefit resurrection.';
