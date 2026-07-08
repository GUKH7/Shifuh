-- Garante funcoes de UUID disponiveis para defaults antigos e RPC nova
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Gestor Delivery - correcao UUID para criacao transacional de pedidos

create or replace function public.create_order_transaction(
  p_restaurant_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address jsonb,
  p_items jsonb,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method text default 'pix',
  p_change_for text default null,
  p_coupon_code text default null,
  p_user_id uuid default null,
  p_status text default 'pending',
  p_external_source text default null,
  p_external_order_id text default null,
  p_external_display_id text default null,
  p_is_test boolean default false,
  p_external_payload jsonb default null,
  p_save_customer boolean default true
)
returns table(order_id uuid, display_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order_id uuid := gen_random_uuid();
  reserved_display_number integer;
  locked_coupon public.coupons%rowtype;
  coupon_usage_count integer;
  item jsonb;
begin
  if p_restaurant_id is null then
    raise exception 'restaurant_id is required';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'customer_name is required';
  end if;

  if nullif(trim(coalesce(p_customer_phone, '')), '') is null then
    raise exception 'customer_phone is required';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'items are required';
  end if;

  if coalesce(p_subtotal, 0) < 0
    or coalesce(p_delivery_fee, 0) < 0
    or coalesce(p_discount, 0) < 0
    or coalesce(p_total, 0) < 0 then
    raise exception 'order totals must be positive';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if p_user_id is not null and p_user_id <> auth.uid() then
      raise exception 'user_id does not match authenticated user';
    end if;

    if nullif(trim(coalesce(p_external_source, '')), '') is not null
      or nullif(trim(coalesce(p_external_order_id, '')), '') is not null
      or nullif(trim(coalesce(p_external_display_id, '')), '') is not null
      or coalesce(p_external_payload, 'null'::jsonb) <> 'null'::jsonb
      or coalesce(p_is_test, false) = true
      or coalesce(nullif(trim(p_status), ''), 'pending') <> 'pending' then
      raise exception 'external order fields require service role';
    end if;
  end if;

  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select *
      into locked_coupon
      from public.coupons
     where restaurant_id = p_restaurant_id
       and code = trim(p_coupon_code)
       and active = true
     for update;

    if not found then
      raise exception 'coupon is invalid';
    end if;

    if locked_coupon.expires_at is not null and locked_coupon.expires_at < now() then
      raise exception 'coupon is expired';
    end if;

    if locked_coupon.usage_limit is not null then
      select count(*)
        into coupon_usage_count
        from public.orders
       where restaurant_id = p_restaurant_id
         and coupon_code = locked_coupon.code;

      if coupon_usage_count >= locked_coupon.usage_limit then
        raise exception 'coupon usage limit reached';
      end if;
    end if;
  end if;

  reserved_display_number := public.next_order_display_number(p_restaurant_id);

  insert into public.orders (
    id,
    restaurant_id,
    user_id,
    customer_name,
    customer_phone,
    address,
    subtotal,
    delivery_fee,
    discount,
    total,
    status,
    payment_method,
    change_for,
    coupon_code,
    display_number,
    external_source,
    external_order_id,
    external_display_id,
    is_test,
    external_payload
  )
  values (
    created_order_id,
    p_restaurant_id,
    p_user_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    coalesce(p_address, '{}'::jsonb),
    round(coalesce(p_subtotal, 0)::numeric, 2),
    round(coalesce(p_delivery_fee, 0)::numeric, 2),
    round(coalesce(p_discount, 0)::numeric, 2),
    round(coalesce(p_total, 0)::numeric, 2),
    coalesce(nullif(trim(p_status), ''), 'pending'),
    coalesce(nullif(trim(p_payment_method), ''), 'pix'),
    nullif(trim(coalesce(p_change_for, '')), ''),
    nullif(trim(coalesce(p_coupon_code, '')), ''),
    reserved_display_number,
    nullif(trim(coalesce(p_external_source, '')), ''),
    nullif(trim(coalesce(p_external_order_id, '')), ''),
    nullif(trim(coalesce(p_external_display_id, '')), ''),
    coalesce(p_is_test, false),
    p_external_payload
  );

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.order_items (
      order_id,
      product_name,
      quantity,
      price,
      observation,
      addons
    )
    values (
      created_order_id,
      nullif(trim(item ->> 'product_name'), ''),
      greatest(coalesce((item ->> 'quantity')::integer, 1), 1),
      round(greatest(coalesce((item ->> 'price')::numeric, 0), 0), 2),
      nullif(trim(coalesce(item ->> 'observation', '')), ''),
      coalesce(item -> 'addons', '[]'::jsonb)
    );
  end loop;

  if p_save_customer then
    insert into public.customers (
      restaurant_id,
      phone,
      name,
      address_json
    )
    values (
      p_restaurant_id,
      trim(p_customer_phone),
      trim(p_customer_name),
      coalesce(p_address, '{}'::jsonb)
    )
    on conflict (restaurant_id, phone) do update
    set
      name = excluded.name,
      address_json = excluded.address_json,
      updated_at = now();
  end if;

  order_id := created_order_id;
  display_number := reserved_display_number;
  return next;
end;
$$;

revoke all on function public.create_order_transaction(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  boolean
) from public;

grant execute on function public.create_order_transaction(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  jsonb,
  boolean
) to anon, authenticated, service_role;
