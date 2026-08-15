-- Keep exposed RPCs as SECURITY INVOKER wrappers; privileged implementation lives in app_private.

create or replace function app_private.create_onboarding_restaurant(
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

revoke all on function app_private.create_onboarding_restaurant(text, text) from public, anon;
grant execute on function app_private.create_onboarding_restaurant(text, text) to authenticated, service_role;

create or replace function public.create_onboarding_restaurant(
  p_name text,
  p_slug text
)
returns table (
  restaurant_id uuid,
  restaurant_name text,
  restaurant_slug text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from app_private.create_onboarding_restaurant(p_name, p_slug);
$$;

revoke all on function public.create_onboarding_restaurant(text, text) from public, anon;
grant execute on function public.create_onboarding_restaurant(text, text) to authenticated, service_role;

create or replace function app_private.set_default_restaurant(p_restaurant_id uuid)
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

revoke all on function app_private.set_default_restaurant(uuid) from public, anon;
grant execute on function app_private.set_default_restaurant(uuid) to authenticated, service_role;

create or replace function public.set_default_restaurant(p_restaurant_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app_private.set_default_restaurant(p_restaurant_id);
$$;

revoke all on function public.set_default_restaurant(uuid) from public, anon;
grant execute on function public.set_default_restaurant(uuid) to authenticated, service_role;
