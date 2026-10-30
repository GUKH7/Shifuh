-- Not applied to any database. Review and test locally before a future authorized migration.
-- Manual credit uses existing accounts/ledger. The customer row lock serializes new-account credits.
create unique index if not exists loyalty_manual_credit_request_unique
  on public.loyalty_point_transactions (restaurant_id, idempotency_key)
  where transaction_type = 'adjustment_credit' and idempotency_key like 'manual:%';

create or replace function public.credit_loyalty_points_manual(
  p_customer_id uuid,
  p_request_id uuid,
  p_mode text,
  p_amount numeric,
  p_reason text
) returns table(points_added bigint, balance_after bigint, transaction_id uuid, was_duplicate boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_restaurant uuid;
  v_program public.loyalty_programs%rowtype;
  v_account public.loyalty_accounts%rowtype;
  v_points bigint;
  v_key text := 'manual:' || p_request_id::text;
  v_old public.loyalty_point_transactions%rowtype;
  v_tx uuid;
  v_balance bigint;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_customer_id is null or p_request_id is null
     or p_mode not in ('spend','points')
     or p_amount is null or p_amount <= 0 or p_amount > 1000000
     or length(btrim(coalesce(p_reason,''))) not between 5 and 200 then
    raise exception 'Invalid manual credit inputs' using errcode = '22023';
  end if;
  -- A single-restaurant owner is the only permitted issuer.
  select m.restaurant_id into strict v_restaurant
    from public.restaurant_members m
   where m.user_id = v_actor and m.role = 'owner' and m.is_default = true;
  -- Acquire the same customer lock before idempotency and balance operations.
  perform 1 from public.customers c
   where c.id = p_customer_id and c.restaurant_id = v_restaurant for update;
  if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
  select * into v_old from public.loyalty_point_transactions t
   where t.restaurant_id = v_restaurant and t.idempotency_key = v_key
     and t.transaction_type = 'adjustment_credit';
  if found then
    if v_old.customer_id <> p_customer_id
       or v_old.metadata->>'mode' is distinct from p_mode
       or (v_old.metadata->>'amount')::numeric is distinct from p_amount
       or v_old.description is distinct from btrim(p_reason) then
      raise exception 'Request key reused with different data' using errcode = '22023';
    end if;
    return query select v_old.points_delta, v_old.balance_after, v_old.id, true;
    return;
  end if;
  select * into v_program from public.loyalty_programs p
   where p.restaurant_id = v_restaurant and p.status = 'active';
  if not found then raise exception 'No active loyalty program' using errcode = '22023'; end if;
  if p_mode = 'points' then
    if p_amount <> trunc(p_amount) then raise exception 'Whole points required' using errcode = '22023'; end if;
    v_points := p_amount::bigint;
  elsif p_amount < v_program.minimum_order_amount then
    raise exception 'Minimum spend not met' using errcode = '22023';
  elsif v_program.earning_mode = 'order' then
    v_points := v_program.points_per_order;
  elsif v_program.earning_mode = 'spend' and v_program.spend_amount > 0
        and v_program.points_per_spend > 0 then
    v_points := floor(p_amount / v_program.spend_amount)::bigint * v_program.points_per_spend;
  else
    raise exception 'Invalid loyalty configuration' using errcode = '22023';
  end if;
  if v_points is null or v_points < 1 or v_points > 10000 then
    raise exception 'Points outside allowed range' using errcode = '22023';
  end if;
  insert into public.loyalty_accounts (restaurant_id, program_id, customer_id)
    values (v_restaurant, v_program.id, p_customer_id) on conflict do nothing;
  select * into strict v_account from public.loyalty_accounts a
    where a.restaurant_id = v_restaurant and a.program_id = v_program.id
      and a.customer_id = p_customer_id for update;
  update public.loyalty_accounts a
     set points_balance = a.points_balance + v_points,
         lifetime_earned = a.lifetime_earned + v_points,
         updated_at = now()
   where a.id = v_account.id
   returning a.points_balance into v_balance;
  insert into public.loyalty_point_transactions (
    account_id,restaurant_id,program_id,customer_id,transaction_type,
    points_delta,balance_after,idempotency_key,description,metadata
  ) values (
    v_account.id,v_restaurant,v_program.id,p_customer_id,'adjustment_credit',
    v_points,v_balance,v_key,btrim(p_reason),
    jsonb_build_object('source','in_person_manual','actor_user_id',v_actor,'mode',p_mode,'amount',p_amount)
  ) returning id into v_tx;
  return query select v_points,v_balance,v_tx,false;
end;
$$;
revoke all on function public.credit_loyalty_points_manual(uuid,uuid,text,numeric,text) from public, anon;
grant execute on function public.credit_loyalty_points_manual(uuid,uuid,text,numeric,text) to authenticated;
