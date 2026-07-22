create or replace function public.enforce_order_pickup_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.address ->> 'fulfillment_type', 'delivery') = 'pickup'
    and not exists (
      select 1
      from public.restaurants
      where id = new.restaurant_id
        and pickup_enabled = true
    )
  then
    raise exception 'pickup is disabled for this restaurant'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_pickup_availability() from public;
revoke all on function public.enforce_order_pickup_availability() from anon, authenticated;

drop trigger if exists enforce_order_pickup_availability on public.orders;

create trigger enforce_order_pickup_availability
before insert or update of restaurant_id, address
on public.orders
for each row
execute function public.enforce_order_pickup_availability();
