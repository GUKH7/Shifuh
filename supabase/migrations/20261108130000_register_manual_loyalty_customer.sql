-- Cadastro presencial por proprietário: não conceder INSERT direto aos usuários.
create or replace function public.register_manual_loyalty_customer(
  p_name text,
  p_phone text
)
returns table (
  customer_id uuid,
  customer_name text,
  customer_phone text,
  was_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_restaurant uuid;
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_phone text := pg_catalog.regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_id uuid;
  v_existing_name text;
  v_existing_phone text;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select m.restaurant_id into v_restaurant
    from public.restaurant_members m
   where m.user_id = v_actor and m.role = 'owner' and m.is_default = true;
  if v_restaurant is null then
    raise exception 'Only the restaurant owner can register manual loyalty customers'
      using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_name) not between 2 and 100 then
    raise exception 'Informe um nome entre 2 e 100 caracteres' using errcode = '22023';
  end if;
  if pg_catalog.left(v_phone, 2) = '55' and pg_catalog.char_length(v_phone) = 13 then
    v_phone := pg_catalog.substr(v_phone, 3);
  end if;
  if v_phone !~ '^[1-9][0-9]9[0-9]{8}$' then
    raise exception 'Informe um celular brasileiro com DDD' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.loyalty_programs p
     where p.restaurant_id = v_restaurant and p.status = 'active'
  ) then
    raise exception 'Programa de fidelidade inativo' using errcode = '22023';
  end if;

  -- Serializa o mesmo celular por restaurante para evitar criação concorrente.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('manual-customer:' || v_restaurant::text || ':' || v_phone, 0)
  );

  -- Reutiliza um cadastro do mesmo restaurante, inclusive telefones legados com +55.
  select c.id, c.name, c.phone
    into v_id, v_existing_name, v_existing_phone
    from public.customers c
   where c.restaurant_id = v_restaurant
     and (
       pg_catalog.regexp_replace(c.phone, '[^0-9]', '', 'g') = v_phone
       or pg_catalog.regexp_replace(c.phone, '[^0-9]', '', 'g') = ('55' || v_phone)
     )
   order by c.created_at asc, c.id asc
   limit 1;

  if v_id is not null then
    return query select v_id, v_existing_name, v_existing_phone, true;
    return;
  end if;

  insert into public.customers (restaurant_id, name, phone)
  values (v_restaurant, v_name, v_phone)
  on conflict (restaurant_id, phone) do nothing
  returning id into v_id;

  if v_id is null then
    select c.id, c.name, c.phone into strict v_id, v_existing_name, v_existing_phone
      from public.customers c
     where c.restaurant_id = v_restaurant and c.phone = v_phone;
    return query select v_id, v_existing_name, v_existing_phone, true;
    return;
  end if;

  return query select v_id, v_name, v_phone, false;
end;
$function$;

revoke all on function public.register_manual_loyalty_customer(text, text) from public;
revoke all on function public.register_manual_loyalty_customer(text, text) from anon;
grant execute on function public.register_manual_loyalty_customer(text, text) to authenticated;
