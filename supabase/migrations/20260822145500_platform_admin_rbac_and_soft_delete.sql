-- Platform administration is independent from restaurant tenancy.
-- Runtime authorization is stored in the database and never derives from email allowlists.

create table if not exists public.platform_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_members_role_check
    check (role in ('owner', 'admin', 'support', 'viewer'))
);

comment on table public.platform_members is
  'Server-side RBAC membership for Shifuh platform operators. Independent from restaurant_members.';
comment on column public.platform_members.role is
  'Platform role: owner, admin, support or viewer.';

create table if not exists public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_audit_log_actor_role_check
    check (actor_role in ('owner', 'admin', 'support', 'viewer')),
  constraint platform_audit_log_action_check
    check (char_length(btrim(action)) between 3 and 120),
  constraint platform_audit_log_target_type_check
    check (char_length(btrim(target_type)) between 2 and 80)
);

comment on table public.platform_audit_log is
  'Append-only audit trail for privileged platform administration actions.';

create index if not exists platform_members_active_role_idx
  on public.platform_members (is_active, role);
create index if not exists platform_audit_log_created_at_idx
  on public.platform_audit_log (created_at desc);
create index if not exists platform_audit_log_actor_idx
  on public.platform_audit_log (actor_user_id, created_at desc);
create index if not exists platform_audit_log_target_idx
  on public.platform_audit_log (target_type, target_id, created_at desc);

alter table public.platform_members enable row level security;
alter table public.platform_audit_log enable row level security;

-- Platform authorization data is server-only. Data API access is explicit because
-- new Supabase projects no longer expose new public tables automatically.
revoke all on table public.platform_members from public, anon, authenticated, service_role;
revoke all on table public.platform_audit_log from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.platform_members to service_role;
grant select, insert on table public.platform_audit_log to service_role;

create or replace function app_private.prevent_platform_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'platform_audit_log is append-only';
end;
$$;

drop trigger if exists platform_audit_log_immutable on public.platform_audit_log;
create trigger platform_audit_log_immutable
before update or delete on public.platform_audit_log
for each row execute function app_private.prevent_platform_audit_mutation();

alter table public.restaurants
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

comment on column public.restaurants.deleted_at is
  'Soft-delete timestamp. Archived restaurants remain recoverable by authorized platform operators.';
comment on column public.restaurants.deleted_by is
  'Platform operator that archived the restaurant, when available.';

create index if not exists restaurants_deleted_at_idx
  on public.restaurants (deleted_at);
create index if not exists restaurants_active_created_at_idx
  on public.restaurants (created_at desc)
  where deleted_at is null;

-- Archived stores are not visible or mutable from the restaurant account itself.
drop policy if exists "Members can read restaurants" on public.restaurants;
create policy "Members can read restaurants"
on public.restaurants
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurants.id
      and rm.user_id = (select auth.uid())
  )
);

drop policy if exists "Members can update restaurants" on public.restaurants;
create policy "Members can update restaurants"
on public.restaurants
for update
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurants.id
      and rm.user_id = (select auth.uid())
  )
)
with check (
  deleted_at is null
  and exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurants.id
      and rm.user_id = (select auth.uid())
  )
);

-- Keep archived stores out of the public storefront contract at the source.
create or replace function app_private.get_public_restaurants()
returns table(
  id uuid,
  name text,
  slug text,
  phone text,
  logo_url text,
  image_url text,
  description text,
  primary_color text,
  address_street text,
  address_number text,
  address_neighborhood text,
  address_city text,
  address_state text,
  work_hours jsonb,
  delivery_tiers jsonb,
  banners text[],
  storefront_headline text,
  storefront_subheadline text,
  storefront_theme jsonb,
  minimum_order_amount numeric,
  scheduled_orders_enabled boolean,
  scheduled_order_lead_minutes integer,
  pickup_enabled boolean,
  rating_average numeric,
  rating_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.name,
    r.slug,
    r.phone,
    r.logo_url,
    r.image_url,
    r.description,
    r.primary_color,
    r.address_street,
    r.address_number,
    r.address_neighborhood,
    r.address_city,
    r.address_state,
    r.work_hours,
    r.delivery_tiers,
    r.banners,
    r.storefront_headline,
    r.storefront_subheadline,
    r.storefront_theme,
    r.minimum_order_amount,
    r.scheduled_orders_enabled,
    r.scheduled_order_lead_minutes,
    r.pickup_enabled,
    r.rating_average,
    r.rating_count
  from public.restaurants r
  where r.deleted_at is null;
$$;

-- Preserve the single-writer onboarding contract while refusing to recreate an archived store.
create or replace function public.create_onboarding_restaurant(
  p_name text,
  p_slug text
)
returns table (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_restaurant_id uuid;
  v_deleted_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'Restaurant name must contain between 2 and 120 characters';
  end if;

  if char_length(v_slug) < 2 or char_length(v_slug) > 80 or v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'Invalid restaurant slug';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  select rm.restaurant_id, r.deleted_at
    into v_restaurant_id, v_deleted_at
  from public.restaurant_members rm
  join public.restaurants r on r.id = rm.restaurant_id
  where rm.user_id = v_user_id
  order by rm.is_default desc, rm.created_at asc, rm.restaurant_id asc
  limit 1;

  if v_restaurant_id is not null then
    if v_deleted_at is not null then
      raise exception using errcode = '42501', message = 'Restaurant archived by platform administration';
    end if;

    return query
      select r.id, r.name, r.slug
      from public.restaurants r
      where r.id = v_restaurant_id
        and r.deleted_at is null;
    return;
  end if;

  insert into public.restaurants (name, slug, user_id)
  values (v_name, v_slug, v_user_id)
  returning id into v_restaurant_id;

  insert into public.restaurant_members (restaurant_id, user_id, role, is_default)
  values (v_restaurant_id, v_user_id, 'owner', true);

  return query
    select r.id, r.name, r.slug
    from public.restaurants r
    where r.id = v_restaurant_id;
end;
$$;

revoke all on function public.create_onboarding_restaurant(text, text) from public, anon;
grant execute on function public.create_onboarding_restaurant(text, text) to authenticated;
