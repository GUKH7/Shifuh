-- Align legacy production schemas with the coupon fields used by the order RPC.
alter table public.coupons
  add column if not exists usage_limit integer;
