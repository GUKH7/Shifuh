-- Strengthen the free-product invariant against issued rewards and concurrent admin writes.
-- Every path that can create a usable free-product relationship takes the same product-scoped lock.

create or replace function public.guard_free_product_reward_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_addons jsonb;
begin
  if coalesce(new.active, true) and new.prize_type = 'free_product' then
    if new.product_id is null then
      raise exception using errcode = '23514', message = 'Free product prize must reference an active restaurant product';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('promotion-free-product:' || new.product_id::text, 0)
    );

    select p.addons
      into v_addons
      from public.products p
     where p.id = new.product_id
       and p.restaurant_id = new.restaurant_id
       and p.is_active = true;

    if not found then
      raise exception using errcode = '23514', message = 'Free product prize must reference an active restaurant product';
    end if;

    if coalesce(jsonb_typeof(v_addons), 'null') = 'array'
      and exists (
        select 1
          from jsonb_array_elements(coalesce(v_addons, '[]'::jsonb)) addon_group
         where coalesce((addon_group ->> 'required')::boolean, false)
            or coalesce(nullif(addon_group ->> 'min_options', '')::integer, 0) > 0
      ) then
      raise exception using errcode = '23514', message = 'Free product prize cannot reference a product with required add-ons';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_free_product_reward_configuration() from public, anon, authenticated;

create or replace function public.guard_available_free_product_reward_configuration()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_addons jsonb;
begin
  if new.status = 'available' and new.reward_type = 'free_product' then
    if new.product_id is null then
      raise exception using errcode = '23514', message = 'Available free product reward must reference a product';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('promotion-free-product:' || new.product_id::text, 0)
    );

    select p.addons
      into v_addons
      from public.products p
     where p.id = new.product_id
       and p.restaurant_id = new.restaurant_id
       and p.is_active = true;

    if not found then
      raise exception using errcode = '23514', message = 'Available free product reward must reference an active restaurant product';
    end if;

    if coalesce(jsonb_typeof(v_addons), 'null') = 'array'
      and exists (
        select 1
          from jsonb_array_elements(coalesce(v_addons, '[]'::jsonb)) addon_group
         where coalesce((addon_group ->> 'required')::boolean, false)
            or coalesce(nullif(addon_group ->> 'min_options', '')::integer, 0) > 0
      ) then
      raise exception using errcode = '23514', message = 'Available free product reward cannot reference a product with required add-ons';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_available_free_product_reward_configuration() from public, anon, authenticated;

drop trigger if exists customer_rewards_guard_free_product_required_addons on public.customer_rewards;
create trigger customer_rewards_guard_free_product_required_addons
before insert or update of reward_type, product_id, status, restaurant_id
on public.customer_rewards
for each row
execute function public.guard_available_free_product_reward_configuration();

create or replace function public.guard_product_required_addons_for_active_rewards()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(new.addons), 'null') = 'array'
    and exists (
      select 1
        from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb)) addon_group
       where coalesce((addon_group ->> 'required')::boolean, false)
          or coalesce(nullif(addon_group ->> 'min_options', '')::integer, 0) > 0
    ) then
    perform pg_advisory_xact_lock(
      hashtextextended('promotion-free-product:' || new.id::text, 0)
    );

    if exists (
      select 1
        from public.promotion_prizes pp
       where pp.restaurant_id = new.restaurant_id
         and pp.product_id = new.id
         and pp.prize_type = 'free_product'
         and pp.active = true
    ) or exists (
      select 1
        from public.customer_rewards cr
       where cr.restaurant_id = new.restaurant_id
         and cr.product_id = new.id
         and cr.reward_type = 'free_product'
         and cr.status = 'available'
         and (cr.expires_at is null or cr.expires_at > now())
    ) then
      raise exception using errcode = '23514', message = 'Product cannot require add-ons while used by an active or issued free-product reward';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_product_required_addons_for_active_rewards() from public, anon, authenticated;
