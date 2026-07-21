alter table public.orders
  add column if not exists cancellation_reason text;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('pending', 'preparing', 'delivering', 'done', 'canceled')),
  changed_at timestamptz not null default now()
);

create index if not exists order_status_history_order_changed_idx
  on public.order_status_history (order_id, changed_at);

alter table public.order_status_history enable row level security;

revoke all on table public.order_status_history from public, anon, authenticated;
grant select, insert, update, delete on table public.order_status_history to service_role;

create or replace function public.record_order_status_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.order_status_history (order_id, status, changed_at)
    values (new.id, new.status, coalesce(new.updated_at, now()));
  end if;

  return new;
end;
$$;

revoke all on function public.record_order_status_history() from public, anon, authenticated;

insert into public.order_status_history (order_id, status, changed_at)
select orders.id, 'pending', orders.created_at
from public.orders
where not exists (
  select 1
  from public.order_status_history history
  where history.order_id = orders.id
    and history.status = 'pending'
);

insert into public.order_status_history (order_id, status, changed_at)
select orders.id, orders.status, orders.updated_at
from public.orders
where orders.status <> 'pending'
  and not exists (
    select 1
    from public.order_status_history history
    where history.order_id = orders.id
      and history.status = orders.status
  );

drop trigger if exists record_order_status_history_trigger on public.orders;
create trigger record_order_status_history_trigger
after insert or update of status on public.orders
for each row
execute function public.record_order_status_history();
