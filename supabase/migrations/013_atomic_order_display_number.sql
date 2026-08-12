-- Shifuh - geração atômica do número visível do pedido

create table if not exists public.order_display_counters (
  restaurant_id uuid primary key references public.restaurants (id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now()
);

insert into public.order_display_counters (restaurant_id, next_value)
select
  restaurants.id,
  coalesce(max(orders.display_number), 0) + 1
from public.restaurants
left join public.orders on orders.restaurant_id = restaurants.id
group by restaurants.id
on conflict (restaurant_id) do update
set
  next_value = greatest(
    public.order_display_counters.next_value,
    excluded.next_value
  ),
  updated_at = now();

alter table public.order_display_counters enable row level security;

create or replace function public.next_order_display_number(p_restaurant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_display_number integer;
begin
  if p_restaurant_id is null then
    raise exception 'restaurant_id is required';
  end if;

  insert into public.order_display_counters (restaurant_id, next_value)
  values (p_restaurant_id, 2)
  on conflict (restaurant_id) do update
  set
    next_value = public.order_display_counters.next_value + 1,
    updated_at = now()
  returning next_value - 1 into reserved_display_number;

  return reserved_display_number;
end;
$$;

grant execute on function public.next_order_display_number(uuid) to anon, authenticated;
