-- Prevent duplicate storefront orders when clients retry the same checkout.

alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists orders_restaurant_idempotency_key_unique
  on public.orders (restaurant_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists public.create_storefront_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric,
  text, text, text, uuid, timestamptz, boolean
);

create function public.create_storefront_order_transaction(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address jsonb,
  p_items jsonb,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method text,
  p_change_for text,
  p_coupon_code text,
  p_user_id uuid,
  p_scheduled_for timestamptz,
  p_save_customer boolean,
  p_idempotency_key text
)
returns table(order_id uuid, display_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order record;
  restaurant_rules record;
  normalized_idempotency_key text := lower(trim(coalesce(p_idempotency_key, '')));
begin
  if normalized_idempotency_key = '' or length(normalized_idempotency_key) > 128 then
    raise exception 'valid idempotency key is required';
  end if;

  select id as order_id, orders.display_number
    into created_order
    from public.orders
   where restaurant_id = p_restaurant_id
     and idempotency_key = normalized_idempotency_key;

  if found then
    order_id := created_order.order_id;
    display_number := created_order.display_number;
    return next;
    return;
  end if;

  select
    minimum_order_amount,
    scheduled_orders_enabled,
    scheduled_order_lead_minutes
  into restaurant_rules
  from public.restaurants
  where id = p_restaurant_id
  for share;

  if not found then
    raise exception 'restaurant is unavailable';
  end if;

  if round(coalesce(p_subtotal, 0)::numeric, 2) < restaurant_rules.minimum_order_amount then
    raise exception 'minimum order amount not reached';
  end if;

  if p_scheduled_for is not null and not restaurant_rules.scheduled_orders_enabled then
    raise exception 'scheduled orders are disabled';
  end if;

  if p_scheduled_for is not null
    and p_scheduled_for < now() + make_interval(mins => restaurant_rules.scheduled_order_lead_minutes) then
    raise exception 'scheduled order lead time not reached';
  end if;

  begin
    select * into created_order
    from public.create_order_transaction(
      p_restaurant_id => p_restaurant_id,
      p_customer_name => p_customer_name,
      p_customer_phone => p_customer_phone,
      p_address => p_address,
      p_items => p_items,
      p_subtotal => p_subtotal,
      p_delivery_fee => p_delivery_fee,
      p_discount => p_discount,
      p_total => p_total,
      p_payment_method => p_payment_method,
      p_change_for => p_change_for,
      p_coupon_code => p_coupon_code,
      p_user_id => p_user_id,
      p_status => 'pending',
      p_external_source => null,
      p_external_order_id => null,
      p_external_display_id => null,
      p_is_test => false,
      p_external_payload => null,
      p_save_customer => p_save_customer
    );

    update public.orders
       set scheduled_for = p_scheduled_for,
           idempotency_key = normalized_idempotency_key
     where id = created_order.order_id;
  exception
    when unique_violation then
      select id as order_id, orders.display_number
        into created_order
        from public.orders
       where restaurant_id = p_restaurant_id
         and idempotency_key = normalized_idempotency_key;

      if not found then
        raise;
      end if;
  end;

  order_id := created_order.order_id;
  display_number := created_order.display_number;
  return next;
end;
$$;

revoke all on function public.create_storefront_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric,
  text, text, text, uuid, timestamptz, boolean, text
) from public, anon, authenticated;

grant execute on function public.create_storefront_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric,
  text, text, text, uuid, timestamptz, boolean, text
) to service_role;
