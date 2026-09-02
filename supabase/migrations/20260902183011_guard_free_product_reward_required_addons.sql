-- Prevent free-product rewards from bypassing required menu choices.
-- The invariant is enforced in both directions:
-- 1) a reward cannot target a product that already requires add-on selections;
-- 2) a product used by an active free-product reward cannot later gain required selections.

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

drop trigger if exists promotion_prizes_guard_free_product_required_addons on public.promotion_prizes;
create trigger promotion_prizes_guard_free_product_required_addons
before insert or update of prize_type, product_id, active, restaurant_id
on public.promotion_prizes
for each row
execute function public.guard_free_product_reward_configuration();

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
    )
    and exists (
      select 1
        from public.promotion_prizes pp
       where pp.restaurant_id = new.restaurant_id
         and pp.product_id = new.id
         and pp.prize_type = 'free_product'
         and pp.active = true
    ) then
    raise exception using errcode = '23514', message = 'Product cannot require add-ons while used by an active free-product reward';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_product_required_addons_for_active_rewards() from public, anon, authenticated;

drop trigger if exists products_guard_required_addons_for_active_rewards on public.products;
create trigger products_guard_required_addons_for_active_rewards
before update of addons
on public.products
for each row
execute function public.guard_product_required_addons_for_active_rewards();
