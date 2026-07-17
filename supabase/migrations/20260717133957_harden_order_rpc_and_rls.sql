-- Restrict order creation to the validated server API.
-- Public clients cannot submit client-controlled totals directly through PostgREST.

alter table public.coupons
  add column if not exists expires_at timestamptz;

drop policy if exists "Public can create customers" on public.customers;
drop policy if exists "Anyone can insert customer for a restaurant" on public.customers;
drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "PÃºblico pode criar pedidos" on public.orders;
drop policy if exists "Qualquer um pode criar pedido" on public.orders;
drop policy if exists "Public can create order items" on public.order_items;
drop policy if exists "Qualquer um pode criar itens do pedido" on public.order_items;

revoke insert on public.customers from anon, authenticated;
revoke insert on public.orders from anon, authenticated;
revoke insert on public.order_items from anon, authenticated;

revoke all on function public.next_order_display_number(uuid) from public, anon, authenticated;
grant execute on function public.next_order_display_number(uuid) to service_role;

revoke all on function public.create_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric, text,
  text, text, uuid, text, text, text, text, boolean, jsonb, boolean
) from public, anon, authenticated;

grant execute on function public.create_order_transaction(
  uuid, text, text, jsonb, jsonb, numeric, numeric, numeric, numeric, text,
  text, text, uuid, text, text, text, text, boolean, jsonb, boolean
) to service_role;
