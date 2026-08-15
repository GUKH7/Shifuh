-- Canonical tenancy model: users <-> restaurant memberships.
-- Restaurant creation during onboarding is intentionally single-writer and idempotent.

create table if not exists public.restaurant_members (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint restaurant_members_pkey primary key (restaurant_id, user_id),
  constraint restaurant_members_role_check check (role in ('owner', 'admin', 'staff'))
);

create index if not exists restaurant_members_user_id_idx
  on public.restaurant_members (user_id);

create unique index if not exists restaurant_members_one_default_per_user_idx
  on public.restaurant_members (user_id)
  where is_default;

comment on table public.restaurant_members is
  'Canonical user-to-restaurant authorization relation. A user may belong to multiple restaurants and a restaurant may have multiple members.';
comment on column public.restaurant_members.role is
  'Membership role. Authorization currently grants operational access to all membership roles; finer role permissions can be layered without changing tenancy.';
comment on column public.restaurants.user_id is
  'DEPRECATED compatibility field: original/creator user only. Do not use for authorization. Use public.restaurant_members.';

with ranked_legacy_owners as (
  select
    r.id as restaurant_id,
    r.user_id,
    row_number() over (
      partition by r.user_id
      order by r.created_at asc, r.id asc
    ) as position
  from public.restaurants r
  where r.user_id is not null
)
insert into public.restaurant_members (restaurant_id, user_id, role, is_default)
select restaurant_id, user_id, 'owner', position = 1
from ranked_legacy_owners
on conflict (restaurant_id, user_id) do nothing;

alter table public.restaurant_members enable row level security;
revoke all on table public.restaurant_members from public, anon, authenticated;
grant select on table public.restaurant_members to authenticated;
grant all on table public.restaurant_members to service_role;

drop policy if exists "Members can read own memberships" on public.restaurant_members;
create policy "Members can read own memberships"
on public.restaurant_members
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, public.profiles.name);

  return new;
end;
$$;

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

  select rm.restaurant_id
    into v_restaurant_id
  from public.restaurant_members rm
  where rm.user_id = v_user_id
  order by rm.is_default desc, rm.created_at asc, rm.restaurant_id asc
  limit 1;

  if v_restaurant_id is not null then
    return query
      select r.id, r.name, r.slug
      from public.restaurants r
      where r.id = v_restaurant_id;
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

create or replace function public.set_default_restaurant(p_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.restaurant_members rm
    where rm.user_id = v_user_id
      and rm.restaurant_id = p_restaurant_id
  ) then
    raise exception using errcode = '42501', message = 'User is not a member of this restaurant';
  end if;

  update public.restaurant_members
  set is_default = false
  where user_id = v_user_id
    and is_default;

  update public.restaurant_members
  set is_default = true
  where user_id = v_user_id
    and restaurant_id = p_restaurant_id;
end;
$$;

revoke all on function public.set_default_restaurant(uuid) from public, anon;
grant execute on function public.set_default_restaurant(uuid) to authenticated;

drop policy if exists "Owners can manage own restaurant" on public.restaurants;
drop policy if exists "Members can read restaurants" on public.restaurants;
drop policy if exists "Members can update restaurants" on public.restaurants;
create policy "Members can read restaurants"
on public.restaurants for select to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = restaurants.id and rm.user_id = (select auth.uid())));
create policy "Members can update restaurants"
on public.restaurants for update to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = restaurants.id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = restaurants.id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can manage own categories" on public.categories;
drop policy if exists "Members can manage restaurant categories" on public.categories;
create policy "Members can manage restaurant categories"
on public.categories for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = categories.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = categories.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can manage own coupons" on public.coupons;
drop policy if exists "Members can manage restaurant coupons" on public.coupons;
create policy "Members can manage restaurant coupons"
on public.coupons for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = coupons.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = coupons.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can read own customers" on public.customers;
drop policy if exists "Owners can update own customers" on public.customers;
drop policy if exists "Members can read restaurant customers" on public.customers;
drop policy if exists "Members can update restaurant customers" on public.customers;
create policy "Members can read restaurant customers"
on public.customers for select to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = customers.restaurant_id and rm.user_id = (select auth.uid())));
create policy "Members can update restaurant customers"
on public.customers for update to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = customers.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = customers.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can manage own products" on public.products;
drop policy if exists "Members can manage restaurant products" on public.products;
create policy "Members can manage restaurant products"
on public.products for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = products.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = products.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can read own orders" on public.orders;
drop policy if exists "Owners can update own orders" on public.orders;
drop policy if exists "Members can read restaurant orders" on public.orders;
drop policy if exists "Members can update restaurant orders" on public.orders;
create policy "Members can read restaurant orders"
on public.orders for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.restaurant_members rm where rm.restaurant_id = orders.restaurant_id and rm.user_id = (select auth.uid())));
create policy "Members can update restaurant orders"
on public.orders for update to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = orders.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = orders.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can read own order items" on public.order_items;
drop policy if exists "Members can read restaurant order items" on public.order_items;
create policy "Members can read restaurant order items"
on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders o
  where o.id = order_items.order_id
    and (o.user_id = (select auth.uid()) or exists (
      select 1 from public.restaurant_members rm
      where rm.restaurant_id = o.restaurant_id and rm.user_id = (select auth.uid())
    ))
));

drop policy if exists "Owners can read own reviews" on public.reviews;
drop policy if exists "Members can read restaurant reviews" on public.reviews;
create policy "Members can read restaurant reviews"
on public.reviews for select to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = reviews.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Restaurant owners can read checkout events" on public.storefront_checkout_events;
drop policy if exists "Restaurant members can read checkout events" on public.storefront_checkout_events;
create policy "Restaurant members can read checkout events"
on public.storefront_checkout_events for select to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = storefront_checkout_events.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "ifood category links owner access" on public.ifood_category_links;
drop policy if exists "ifood category links member access" on public.ifood_category_links;
create policy "ifood category links member access"
on public.ifood_category_links for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_category_links.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_category_links.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "ifood integrations owner access" on public.ifood_integrations;
drop policy if exists "ifood integrations member access" on public.ifood_integrations;
create policy "ifood integrations member access"
on public.ifood_integrations for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_integrations.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_integrations.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can manage own ifood order events" on public.ifood_order_events;
drop policy if exists "Members can manage restaurant ifood order events" on public.ifood_order_events;
create policy "Members can manage restaurant ifood order events"
on public.ifood_order_events for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_order_events.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_order_events.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "ifood product links owner access" on public.ifood_product_links;
drop policy if exists "ifood product links member access" on public.ifood_product_links;
create policy "ifood product links member access"
on public.ifood_product_links for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_product_links.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_product_links.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Owners can manage own ifood sync runs" on public.ifood_sync_runs;
drop policy if exists "Members can manage restaurant ifood sync runs" on public.ifood_sync_runs;
create policy "Members can manage restaurant ifood sync runs"
on public.ifood_sync_runs for all to authenticated
using (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_sync_runs.restaurant_id and rm.user_id = (select auth.uid())))
with check (exists (select 1 from public.restaurant_members rm where rm.restaurant_id = ifood_sync_runs.restaurant_id and rm.user_id = (select auth.uid())));

drop policy if exists "Gestor Delivery restaurant image insert" on storage.objects;
drop policy if exists "Gestor Delivery restaurant image update" on storage.objects;
drop policy if exists "Gestor Delivery restaurant image delete" on storage.objects;
create policy "Gestor Delivery restaurant image insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and exists (select 1 from public.restaurant_members rm where rm.restaurant_id::text = (storage.foldername(objects.name))[1] and rm.user_id = (select auth.uid()))
);
create policy "Gestor Delivery restaurant image update"
on storage.objects for update to authenticated
using (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and exists (select 1 from public.restaurant_members rm where rm.restaurant_id::text = (storage.foldername(objects.name))[1] and rm.user_id = (select auth.uid()))
)
with check (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and exists (select 1 from public.restaurant_members rm where rm.restaurant_id::text = (storage.foldername(objects.name))[1] and rm.user_id = (select auth.uid()))
);
create policy "Gestor Delivery restaurant image delete"
on storage.objects for delete to authenticated
using (
  bucket_id = any (array['restaurant-images'::text, 'menu-images'::text])
  and exists (select 1 from public.restaurant_members rm where rm.restaurant_id::text = (storage.foldername(objects.name))[1] and rm.user_id = (select auth.uid()))
);
