-- Transactional proof that tenant A cannot access tenant B.
-- All fixtures are removed before the migration commits.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'restaurants', 'categories', 'products', 'customers', 'orders',
        'order_items', 'profiles', 'customer_addresses', 'coupons', 'reviews',
        'ifood_integrations', 'ifood_category_links', 'ifood_product_links',
        'ifood_order_events', 'ifood_sync_runs'
      )
      and (tablename, policyname) not in (
        ('restaurants', 'Owners can manage own restaurant'),
        ('categories', 'Public can read categories'),
        ('categories', 'Owners can manage own categories'),
        ('products', 'Public can read active products'),
        ('products', 'Owners can manage own products'),
        ('customers', 'Owners can read own customers'),
        ('customers', 'Owners can update own customers'),
        ('orders', 'Owners can read own orders'),
        ('orders', 'Owners can update own orders'),
        ('order_items', 'Owners can read own order items'),
        ('profiles', 'Users can manage own profile'),
        ('customer_addresses', 'Users can manage own addresses'),
        ('coupons', 'Owners can manage own coupons'),
        ('reviews', 'Owners can read own reviews'),
        ('reviews', 'Customers can create reviews'),
        ('reviews', 'Customers can read own reviews'),
        ('ifood_integrations', 'ifood integrations owner access'),
        ('ifood_category_links', 'ifood category links owner access'),
        ('ifood_product_links', 'ifood product links owner access'),
        ('ifood_order_events', 'Owners can manage own ifood order events'),
        ('ifood_sync_runs', 'Owners can manage own ifood sync runs')
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

grant select on public.public_restaurants to anon, authenticated;
grant select on public.categories, public.products to anon;

grant select, insert, update, delete on public.restaurants to authenticated;
grant select, insert, update, delete on public.categories, public.products to authenticated;
grant select, update on public.customers, public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select, insert, update, delete on public.profiles, public.customer_addresses to authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
grant select, insert on public.reviews to authenticated;
grant select, insert, update, delete on
  public.ifood_integrations,
  public.ifood_category_links,
  public.ifood_product_links,
  public.ifood_order_events,
  public.ifood_sync_runs
to authenticated;

grant all privileges on
  public.restaurants,
  public.categories,
  public.products,
  public.customers,
  public.orders,
  public.order_items,
  public.profiles,
  public.customer_addresses,
  public.coupons,
  public.reviews,
  public.ifood_integrations,
  public.ifood_category_links,
  public.ifood_product_links,
  public.ifood_order_events,
  public.ifood_sync_runs,
  public.order_display_counters
to service_role;

do $$
declare
  owner_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  restaurant_a uuid := gen_random_uuid();
  restaurant_b uuid := gen_random_uuid();
  order_b uuid := gen_random_uuid();
  visible_count integer;
  changed_count integer;
  blocked_insert boolean := false;
begin
  begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  values
    (
      '00000000-0000-0000-0000-000000000000', owner_a,
      'authenticated', 'authenticated', owner_a || '@rls-check.invalid', '',
      now(), now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', owner_b,
      'authenticated', 'authenticated', owner_b || '@rls-check.invalid', '',
      now(), now(), now()
    );

  insert into public.restaurants (id, user_id, name, slug, whatsapp_number)
  values
    (restaurant_a, owner_a, 'RLS Check A', 'rls-check-a-' || restaurant_a, '551100000001'),
    (restaurant_b, owner_b, 'RLS Check B', 'rls-check-b-' || restaurant_b, '551100000002');

  insert into public.customers (restaurant_id, phone, name)
  values (restaurant_b, '5511999999999', 'Cliente RLS B');

  insert into public.coupons (restaurant_id, code, value, discount_type)
  values (restaurant_b, 'RLS-' || left(restaurant_b::text, 8), 5, 'fixed');

  insert into public.ifood_integrations (restaurant_id, merchant_id)
  values (restaurant_b, 'merchant-' || restaurant_b);

  insert into public.orders (
    id, restaurant_id, customer_name, customer_phone, subtotal, delivery_fee,
    discount, total, status, payment_method
  )
  values (
    order_b, restaurant_b, 'Cliente Pedido B', '5511888888888', 10, 0,
    0, 10, 'pending', 'pix'
  );

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_a, 'role', 'authenticated')::text,
    true
  );
  execute 'set local role authenticated';

  execute 'select count(*) from public.restaurants where id = $1'
    into visible_count using restaurant_a;
  if visible_count <> 1 then
    raise exception 'RLS verification failed: tenant A cannot read its restaurant';
  end if;

  execute 'select count(*) from public.restaurants where id = $1'
    into visible_count using restaurant_b;
  if visible_count <> 0 then
    raise exception 'RLS verification failed: tenant A read tenant B restaurant';
  end if;

  execute 'select count(*) from public.customers where restaurant_id = $1'
    into visible_count using restaurant_b;
  if visible_count <> 0 then
    raise exception 'RLS verification failed: tenant A read tenant B customers';
  end if;

  execute 'select count(*) from public.coupons where restaurant_id = $1'
    into visible_count using restaurant_b;
  if visible_count <> 0 then
    raise exception 'RLS verification failed: tenant A read tenant B coupons';
  end if;

  execute 'select count(*) from public.ifood_integrations where restaurant_id = $1'
    into visible_count using restaurant_b;
  if visible_count <> 0 then
    raise exception 'RLS verification failed: tenant A read tenant B integration';
  end if;

  execute 'select count(*) from public.orders where restaurant_id = $1'
    into visible_count using restaurant_b;
  if visible_count <> 0 then
    raise exception 'RLS verification failed: tenant A read tenant B orders';
  end if;

  execute 'update public.orders set status = ''done'' where id = $1' using order_b;
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then
    raise exception 'RLS verification failed: tenant A updated tenant B order';
  end if;

  begin
    execute 'insert into public.coupons (restaurant_id, code, value, discount_type)
      values ($1, $2, 1, ''fixed'')'
      using restaurant_b, 'RLS-INVASION-' || left(owner_a::text, 8);
  exception
    when insufficient_privilege or check_violation then
      blocked_insert := true;
  end;
  if not blocked_insert then
    raise exception 'RLS verification failed: tenant A inserted tenant B coupon';
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', owner_b, 'role', 'authenticated')::text,
    true
  );
  execute 'select count(*) from public.orders where id = $1'
    into visible_count using order_b;
  if visible_count <> 1 then
    raise exception 'RLS verification failed: tenant B cannot read its order';
  end if;

    raise exception using
      errcode = 'ZT001',
      message = 'RLS verification complete; rolling back fixtures';
  exception
    when sqlstate 'ZT001' then
      null;
  end;
end;
$$;
