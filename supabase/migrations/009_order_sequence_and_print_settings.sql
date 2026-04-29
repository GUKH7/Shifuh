alter table public.restaurants
  add column if not exists printer_font_weight integer not null default 700;

alter table public.orders
  add column if not exists display_number integer;

with ordered_orders as (
  select
    id,
    row_number() over (partition by restaurant_id order by created_at asc, id asc) as seq
  from public.orders
)
update public.orders as orders
set display_number = ordered_orders.seq
from ordered_orders
where orders.id = ordered_orders.id
  and orders.display_number is null;

create unique index if not exists orders_restaurant_display_number_idx
  on public.orders (restaurant_id, display_number);
