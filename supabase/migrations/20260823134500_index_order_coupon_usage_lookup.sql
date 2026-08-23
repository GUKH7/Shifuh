create index if not exists idx_orders_restaurant_coupon_code
on public.orders (restaurant_id, coupon_code)
where coupon_code is not null;
