create or replace function public.guard_ifood_order_status_regression()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  old_rank integer;
  new_rank integer;
  ignored_event jsonb;
begin
  if old.external_source is distinct from 'ifood'
     or new.external_source is distinct from 'ifood'
     or new.status is not distinct from old.status then
    return new;
  end if;

  old_rank := case old.status
    when 'pending' then 10
    when 'preparing' then 20
    when 'delivering' then 30
    when 'done' then 40
    when 'canceled' then 100
    else 0
  end;

  new_rank := case new.status
    when 'pending' then 10
    when 'preparing' then 20
    when 'delivering' then 30
    when 'done' then 40
    when 'canceled' then 100
    else 0
  end;

  if old.status in ('done', 'canceled') and new.status <> old.status then
    ignored_event := jsonb_build_object(
      'previousStatus', old.status,
      'attemptedStatus', new.status,
      'ignoredAt', now(),
      'reason', 'terminal_status_protected'
    );
    new.status := old.status;
  elsif new.status <> 'canceled' and new_rank < old_rank then
    ignored_event := jsonb_build_object(
      'previousStatus', old.status,
      'attemptedStatus', new.status,
      'ignoredAt', now(),
      'reason', 'status_regression_prevented'
    );
    new.status := old.status;
  end if;

  if ignored_event is not null then
    new.external_payload := jsonb_set(
      coalesce(new.external_payload, '{}'::jsonb),
      '{gestorDelivery,ignoredStatusEvent}',
      ignored_event,
      true
    );
  else
    new.external_payload := jsonb_set(
      coalesce(new.external_payload, '{}'::jsonb),
      '{gestorDelivery,lastAppliedStatus}',
      to_jsonb(new.status),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_ifood_order_status_regression on public.orders;

create trigger trg_guard_ifood_order_status_regression
before update of status, external_payload on public.orders
for each row
when (old.external_source = 'ifood' or new.external_source = 'ifood')
execute function public.guard_ifood_order_status_regression();

comment on function public.guard_ifood_order_status_regression() is
  'Impede que eventos antigos do iFood façam pedidos regredirem de status e registra a tentativa ignorada no payload externo.';
