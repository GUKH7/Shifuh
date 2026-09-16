create table if not exists public.customer_phone_otp_routes (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  constraint customer_phone_otp_routes_phone_br_check
    check (phone ~ '^\+55[0-9]{10,11}$'),
  constraint customer_phone_otp_routes_expiry_check
    check (expires_at > created_at)
);

create index if not exists customer_phone_otp_routes_phone_created_idx
  on public.customer_phone_otp_routes (phone, created_at desc);

create index if not exists customer_phone_otp_routes_expiry_idx
  on public.customer_phone_otp_routes (expires_at)
  where consumed_at is null;

alter table public.customer_phone_otp_routes enable row level security;

revoke all on public.customer_phone_otp_routes from anon, authenticated;
grant select, insert, update, delete on public.customer_phone_otp_routes to service_role;

comment on table public.customer_phone_otp_routes is
  'Short-lived server-only routing context that binds a customer phone OTP request to the storefront restaurant whose WhatsApp must deliver it.';
