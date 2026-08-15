create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  member_limit integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_code_format check (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  constraint subscription_plans_name_length check (char_length(btrim(name)) between 2 and 80),
  constraint subscription_plans_member_limit check (member_limit is null or member_limit >= 1)
);

create table if not exists public.restaurant_subscriptions (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'active',
  provider text null,
  provider_customer_id text null,
  provider_subscription_id text null,
  started_at timestamptz not null default now(),
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_subscriptions_status check (
    status in ('trialing', 'active', 'past_due', 'paused', 'canceled', 'expired')
  )
);

create unique index if not exists restaurant_subscriptions_provider_subscription_uidx
  on public.restaurant_subscriptions(provider, provider_subscription_id)
  where provider is not null and provider_subscription_id is not null;

create index if not exists restaurant_subscriptions_plan_idx
  on public.restaurant_subscriptions(plan_id);

insert into public.subscription_plans (code, name, member_limit, is_active)
values ('legacy', 'Legado', null, false)
on conflict (code) do update set
  name = excluded.name,
  member_limit = excluded.member_limit,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.restaurant_subscriptions (restaurant_id, plan_id, status, provider)
select r.id, p.id, 'active', 'legacy_migration'
from public.restaurants r
cross join public.subscription_plans p
where p.code = 'legacy'
  and not exists (
    select 1
    from public.restaurant_subscriptions rs
    where rs.restaurant_id = r.id
  );

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
before update on public.subscription_plans
for each row execute function public.set_updated_at();

drop trigger if exists restaurant_subscriptions_set_updated_at on public.restaurant_subscriptions;
create trigger restaurant_subscriptions_set_updated_at
before update on public.restaurant_subscriptions
for each row execute function public.set_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;

drop policy if exists "Authenticated can read active subscription plans" on public.subscription_plans;
create policy "Authenticated can read active subscription plans"
on public.subscription_plans
for select
to authenticated
using (is_active = true);

drop policy if exists "Members can read own restaurant subscription" on public.restaurant_subscriptions;
create policy "Members can read own restaurant subscription"
on public.restaurant_subscriptions
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_subscriptions.restaurant_id
      and rm.user_id = (select auth.uid())
  )
);

create or replace function app_private.enforce_restaurant_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_has_entitled_plan boolean := false;
  v_used integer;
begin
  if tg_op = 'UPDATE' and new.restaurant_id = old.restaurant_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.restaurant_id::text, 947)
  );

  select sp.member_limit, true
    into v_limit, v_has_entitled_plan
  from public.restaurant_subscriptions rs
  join public.subscription_plans sp on sp.id = rs.plan_id
  where rs.restaurant_id = new.restaurant_id
    and rs.status in ('trialing', 'active', 'past_due')
  limit 1;

  if not coalesce(v_has_entitled_plan, false) then
    v_limit := 1;
  end if;

  if v_limit is null then
    return new;
  end if;

  select count(*)::integer
    into v_used
  from public.restaurant_members rm
  where rm.restaurant_id = new.restaurant_id;

  if v_used >= v_limit then
    raise exception using
      errcode = 'P0001',
      message = 'restaurant_member_limit_reached',
      detail = format('The restaurant plan allows %s member(s) and all seats are currently in use.', v_limit),
      hint = 'Remove a member or upgrade the subscription plan before adding another user.';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_restaurant_member_limit() from public, anon, authenticated, service_role;

drop trigger if exists restaurant_members_enforce_plan_limit on public.restaurant_members;
create trigger restaurant_members_enforce_plan_limit
before insert or update of restaurant_id on public.restaurant_members
for each row execute function app_private.enforce_restaurant_member_limit();

create or replace function app_private.get_restaurant_member_entitlement(p_restaurant_id uuid)
returns table (
  restaurant_id uuid,
  plan_code text,
  plan_name text,
  subscription_status text,
  member_limit integer,
  members_used integer,
  members_remaining integer,
  is_unlimited boolean,
  is_over_limit boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := coalesce(
    current_setting('request.jwt.claim.role', true) = 'service_role',
    false
  );
begin
  if not v_is_service_role and (
    v_user_id is null or not exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = p_restaurant_id
        and rm.user_id = v_user_id
    )
  ) then
    raise exception using errcode = '42501', message = 'User is not a member of this restaurant';
  end if;

  return query
  with current_plan as (
    select
      sp.code,
      sp.name,
      sp.member_limit,
      rs.status
    from public.restaurant_subscriptions rs
    join public.subscription_plans sp on sp.id = rs.plan_id
    where rs.restaurant_id = p_restaurant_id
      and rs.status in ('trialing', 'active', 'past_due')
    limit 1
  ), usage as (
    select count(*)::integer as used
    from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
  )
  select
    p_restaurant_id,
    coalesce(cp.code, 'unsubscribed')::text,
    coalesce(cp.name, 'Sem assinatura')::text,
    coalesce(cp.status, 'none')::text,
    case when cp.code is null then 1 else cp.member_limit end,
    u.used,
    case
      when cp.code is not null and cp.member_limit is null then null
      else greatest((case when cp.code is null then 1 else cp.member_limit end) - u.used, 0)
    end,
    (cp.code is not null and cp.member_limit is null),
    case
      when cp.code is not null and cp.member_limit is null then false
      else u.used > (case when cp.code is null then 1 else cp.member_limit end)
    end
  from usage u
  left join current_plan cp on true;
end;
$$;

revoke all on function app_private.get_restaurant_member_entitlement(uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.get_restaurant_member_entitlement(uuid) to authenticated, service_role;

create or replace function public.get_restaurant_member_entitlement(p_restaurant_id uuid)
returns table (
  restaurant_id uuid,
  plan_code text,
  plan_name text,
  subscription_status text,
  member_limit integer,
  members_used integer,
  members_remaining integer,
  is_unlimited boolean,
  is_over_limit boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from app_private.get_restaurant_member_entitlement(p_restaurant_id);
$$;

revoke all on function public.get_restaurant_member_entitlement(uuid) from public, anon;
grant execute on function public.get_restaurant_member_entitlement(uuid) to authenticated, service_role;

comment on table public.subscription_plans is
  'Commercial plan catalog. member_limit counts the owner and every other restaurant member; NULL means unlimited.';
comment on table public.restaurant_subscriptions is
  'Current subscription state for each restaurant. Billing providers should update this table through trusted server-side code.';
comment on function public.get_restaurant_member_entitlement(uuid) is
  'Returns plan seat limit and current member usage for a restaurant visible to the authenticated member.';
