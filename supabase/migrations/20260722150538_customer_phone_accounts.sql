create table if not exists public.customer_phone_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  phone text not null unique check (phone ~ '^\+55[0-9]{10,11}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_phone_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_phone_sessions_user
  on public.customer_phone_sessions (auth_user_id);
create index if not exists idx_customer_phone_sessions_expiry
  on public.customer_phone_sessions (expires_at);

alter table public.customer_phone_accounts enable row level security;
alter table public.customer_phone_sessions enable row level security;

revoke all on public.customer_phone_accounts from anon, authenticated;
revoke all on public.customer_phone_sessions from anon, authenticated;

comment on table public.customer_phone_accounts is
  'Server-only mapping between a normalized phone and an unverified Supabase Auth customer.';
comment on table public.customer_phone_sessions is
  'Server-only persistent customer sessions. Only SHA-256 token hashes are stored.';
