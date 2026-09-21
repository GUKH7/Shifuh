-- Shared/reusable addon groups for menu products.
-- Linked groups share pause/edit state across every product using the same group.
-- products.addons remains an effective JSON cache for storefront/reward compatibility.

create table if not exists public.addon_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  required boolean not null default false,
  min_options integer not null default 0 check (min_options >= 0),
  max_options integer not null default 0 check (max_options >= 0),
  is_active boolean not null default true,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_groups_title_not_blank check (length(trim(title)) > 0),
  constraint addon_groups_limits_valid check (max_options = 0 or min_options <= max_options)
);

create table if not exists public.product_addon_group_links (
  product_id uuid not null references public.products(id) on delete cascade,
  addon_group_id uuid not null references public.addon_groups(id) on delete cascade,
  sort_order integer not null default 1 check (sort_order > 0),
  created_at timestamptz not null default now(),
  primary key (product_id, addon_group_id)
);

create index if not exists addon_groups_restaurant_idx
  on public.addon_groups (restaurant_id, title);

create index if not exists product_addon_group_links_group_idx
  on public.product_addon_group_links (addon_group_id, product_id);

alter table public.addon_groups enable row level security;
alter table public.product_addon_group_links enable row level security;

drop policy if exists "Members can read addon groups" on public.addon_groups;
create policy "Members can read addon groups"
  on public.addon_groups
  for select
  to authenticated
  using (app_private.is_active_restaurant_member(restaurant_id));

drop policy if exists "Members can insert addon groups" on public.addon_groups;
create policy "Members can insert addon groups"
  on public.addon_groups
  for insert
  to authenticated
  with check (app_private.is_active_restaurant_member(restaurant_id));

drop policy if exists "Members can update addon groups" on public.addon_groups;
create policy "Members can update addon groups"
  on public.addon_groups
  for update
  to authenticated
  using (app_private.is_active_restaurant_member(restaurant_id))
  with check (app_private.is_active_restaurant_member(restaurant_id));

drop policy if exists "Members can delete addon groups" on public.addon_groups;
create policy "Members can delete addon groups"
  on public.addon_groups
  for delete
  to authenticated
  using (app_private.is_active_restaurant_member(restaurant_id));

drop policy if exists "Members can read product addon links" on public.product_addon_group_links;
create policy "Members can read product addon links"
  on public.product_addon_group_links
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.addon_groups g on g.id = product_addon_group_links.addon_group_id
      where p.id = product_addon_group_links.product_id
        and p.restaurant_id = g.restaurant_id
        and app_private.is_active_restaurant_member(p.restaurant_id)
    )
  );

drop policy if exists "Members can insert product addon links" on public.product_addon_group_links;
create policy "Members can insert product addon links"
  on public.product_addon_group_links
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.products p
      join public.addon_groups g on g.id = product_addon_group_links.addon_group_id
      where p.id = product_addon_group_links.product_id
        and p.restaurant_id = g.restaurant_id
        and app_private.is_active_restaurant_member(p.restaurant_id)
    )
  );

drop policy if exists "Members can update product addon links" on public.product_addon_group_links;
create policy "Members can update product addon links"
  on public.product_addon_group_links
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.addon_groups g on g.id = product_addon_group_links.addon_group_id
      where p.id = product_addon_group_links.product_id
        and p.restaurant_id = g.restaurant_id
        and app_private.is_active_restaurant_member(p.restaurant_id)
    )
  )
  with check (
    exists (
      select 1
      from public.products p
      join public.addon_groups g on g.id = product_addon_group_links.addon_group_id
      where p.id = product_addon_group_links.product_id
        and p.restaurant_id = g.restaurant_id
        and app_private.is_active_restaurant_member(p.restaurant_id)
    )
  );

drop policy if exists "Members can delete product addon links" on public.product_addon_group_links;
create policy "Members can delete product addon links"
  on public.product_addon_group_links
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      join public.addon_groups g on g.id = product_addon_group_links.addon_group_id
      where p.id = product_addon_group_links.product_id
        and p.restaurant_id = g.restaurant_id
        and app_private.is_active_restaurant_member(p.restaurant_id)
    )
  );

grant select, insert, update, delete on public.addon_groups to authenticated;
grant select, insert, update, delete on public.product_addon_group_links to authenticated;

create or replace function app_private.touch_addon_group_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists addon_groups_touch_updated_at on public.addon_groups;
create trigger addon_groups_touch_updated_at
before update on public.addon_groups
for each row execute function app_private.touch_addon_group_updated_at();

create or replace function app_private.validate_product_addon_group_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_restaurant uuid;
  v_group_restaurant uuid;
begin
  select restaurant_id into v_product_restaurant
  from public.products
  where id = new.product_id;

  select restaurant_id into v_group_restaurant
  from public.addon_groups
  where id = new.addon_group_id;

  if v_product_restaurant is null or v_group_restaurant is null then
    raise exception using errcode = '23503', message = 'Produto ou grupo de complementos não encontrado';
  end if;

  if v_product_restaurant <> v_group_restaurant then
    raise exception using errcode = '23514', message = 'Grupo de complementos e produto devem pertencer ao mesmo restaurante';
  end if;

  return new;
end;
$$;

drop trigger if exists product_addon_group_links_validate on public.product_addon_group_links;
create trigger product_addon_group_links_validate
before insert or update on public.product_addon_group_links
for each row execute function app_private.validate_product_addon_group_link();

create or replace function app_private.sync_product_addons_cache(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addons jsonb;
begin
  select coalesce(
    jsonb_agg(resolved.group_json order by resolved.sort_order, resolved.group_id),
    '[]'::jsonb
  )
  into v_addons
  from (
    select
      l.sort_order,
      g.id as group_id,
      jsonb_build_object(
        'id', g.id::text,
        'title', g.title,
        'required', g.required,
        'min_options', g.min_options,
        'max_options', g.max_options,
        'options', (
          select coalesce(
            jsonb_agg(
              jsonb_build_object(
                'id', coalesce(nullif(opt.value->>'id', ''), pg_catalog.gen_random_uuid()::text),
                'name', trim(coalesce(opt.value->>'name', '')),
                'price', case
                  when coalesce(opt.value->>'price', '') ~ '^[0-9]+([.][0-9]+)?$'
                    then (opt.value->>'price')::numeric
                  else 0
                end
              )
              order by opt.ordinality
            ),
            '[]'::jsonb
          )
          from jsonb_array_elements(g.options) with ordinality as opt(value, ordinality)
          where trim(coalesce(opt.value->>'name', '')) <> ''
            and coalesce(nullif(opt.value->>'is_active', '')::boolean, true)
        )
      ) as group_json
    from public.product_addon_group_links l
    join public.addon_groups g on g.id = l.addon_group_id
    where l.product_id = p_product_id
      and g.is_active
      and exists (
        select 1
        from jsonb_array_elements(g.options) as active_opt(value)
        where trim(coalesce(active_opt.value->>'name', '')) <> ''
          and coalesce(nullif(active_opt.value->>'is_active', '')::boolean, true)
      )
  ) as resolved;

  update public.products
  set addons = v_addons,
      updated_at = pg_catalog.now()
  where id = p_product_id
    and addons is distinct from v_addons;
end;
$$;

revoke all on function app_private.sync_product_addons_cache(uuid) from public;
revoke all on function app_private.sync_product_addons_cache(uuid) from anon;
revoke all on function app_private.sync_product_addons_cache(uuid) from authenticated;

create or replace function app_private.sync_products_for_addon_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_product_id uuid;
begin
  v_group_id := coalesce(new.id, old.id);

  for v_product_id in
    select l.product_id
    from public.product_addon_group_links l
    where l.addon_group_id = v_group_id
  loop
    perform app_private.sync_product_addons_cache(v_product_id);
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists addon_groups_sync_products on public.addon_groups;
create trigger addon_groups_sync_products
after update on public.addon_groups
for each row execute function app_private.sync_products_for_addon_group();

create or replace function app_private.sync_product_for_addon_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app_private.sync_product_addons_cache(old.product_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    perform app_private.sync_product_addons_cache(new.product_id);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists product_addon_group_links_sync_product on public.product_addon_group_links;
create trigger product_addon_group_links_sync_product
after insert or update or delete on public.product_addon_group_links
for each row execute function app_private.sync_product_for_addon_link();

create or replace function public.save_product_addon_configuration(
  p_product_id uuid,
  p_groups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_group jsonb;
  v_group_id uuid;
  v_existing_restaurant_id uuid;
  v_title text;
  v_required boolean;
  v_min_options integer;
  v_max_options integer;
  v_is_active boolean;
  v_options jsonb;
  v_option jsonb;
  v_option_id uuid;
  v_option_name text;
  v_option_price numeric;
  v_option_active boolean;
  v_group_ids uuid[] := array[]::uuid[];
  v_sort_order integer := 0;
begin
  select p.restaurant_id
  into v_restaurant_id
  from public.products p
  where p.id = p_product_id;

  if v_restaurant_id is null then
    raise exception using errcode = 'P0002', message = 'Produto não encontrado';
  end if;

  if not app_private.is_active_restaurant_member(v_restaurant_id) then
    raise exception using errcode = '42501', message = 'Sem acesso a este restaurante';
  end if;

  p_groups := coalesce(p_groups, '[]'::jsonb);
  if jsonb_typeof(p_groups) <> 'array' then
    raise exception using errcode = '22023', message = 'Configuração de complementos inválida';
  end if;

  if jsonb_array_length(p_groups) > 50 then
    raise exception using errcode = '22023', message = 'Limite de grupos de complementos excedido';
  end if;

  for v_group in
    select value from jsonb_array_elements(p_groups)
  loop
    v_sort_order := v_sort_order + 1;

    begin
      v_group_id := (v_group->>'id')::uuid;
    exception when others then
      v_group_id := pg_catalog.gen_random_uuid();
    end;

    v_title := left(trim(coalesce(v_group->>'title', '')), 160);
    if v_title = '' then
      raise exception using errcode = '22023', message = 'Todo grupo de complementos precisa de nome';
    end if;

    v_required := coalesce(nullif(v_group->>'required', '')::boolean, false);
    v_min_options := greatest(0, coalesce(nullif(v_group->>'min_options', '')::integer, case when v_required then 1 else 0 end));
    v_max_options := greatest(0, coalesce(nullif(v_group->>'max_options', '')::integer, 0));
    v_is_active := coalesce(nullif(v_group->>'is_active', '')::boolean, true);

    if v_max_options > 0 and v_min_options > v_max_options then
      raise exception using errcode = '22023', message = 'O mínimo de escolhas não pode ser maior que o máximo';
    end if;

    if jsonb_typeof(coalesce(v_group->'options', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'Opções de complemento inválidas';
    end if;

    if jsonb_array_length(coalesce(v_group->'options', '[]'::jsonb)) > 100 then
      raise exception using errcode = '22023', message = 'Limite de opções de complemento excedido';
    end if;

    v_options := '[]'::jsonb;

    for v_option in
      select value from jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb))
    loop
      v_option_name := left(trim(coalesce(v_option->>'name', '')), 160);
      if v_option_name = '' then
        continue;
      end if;

      begin
        v_option_id := (v_option->>'id')::uuid;
      exception when others then
        v_option_id := pg_catalog.gen_random_uuid();
      end;

      if coalesce(v_option->>'price', '') ~ '^[0-9]+([.][0-9]+)?$' then
        v_option_price := greatest(0, (v_option->>'price')::numeric);
      else
        v_option_price := 0;
      end if;

      v_option_active := coalesce(nullif(v_option->>'is_active', '')::boolean, true);

      v_options := v_options || jsonb_build_array(
        jsonb_build_object(
          'id', v_option_id::text,
          'name', v_option_name,
          'price', v_option_price,
          'is_active', v_option_active
        )
      );
    end loop;

    select g.restaurant_id
    into v_existing_restaurant_id
    from public.addon_groups g
    where g.id = v_group_id;

    if v_existing_restaurant_id is not null and v_existing_restaurant_id <> v_restaurant_id then
      raise exception using errcode = '42501', message = 'Grupo de complementos pertence a outro restaurante';
    end if;

    insert into public.addon_groups (
      id,
      restaurant_id,
      title,
      required,
      min_options,
      max_options,
      is_active,
      options
    )
    values (
      v_group_id,
      v_restaurant_id,
      v_title,
      v_required,
      v_min_options,
      v_max_options,
      v_is_active,
      v_options
    )
    on conflict (id) do update
    set title = excluded.title,
        required = excluded.required,
        min_options = excluded.min_options,
        max_options = excluded.max_options,
        is_active = excluded.is_active,
        options = excluded.options,
        updated_at = pg_catalog.now()
    where public.addon_groups.restaurant_id = excluded.restaurant_id;

    insert into public.product_addon_group_links (
      product_id,
      addon_group_id,
      sort_order
    )
    values (
      p_product_id,
      v_group_id,
      v_sort_order
    )
    on conflict (product_id, addon_group_id) do update
    set sort_order = excluded.sort_order;

    v_group_ids := array_append(v_group_ids, v_group_id);
  end loop;

  if cardinality(v_group_ids) = 0 then
    delete from public.product_addon_group_links
    where product_id = p_product_id;
  else
    delete from public.product_addon_group_links
    where product_id = p_product_id
      and not (addon_group_id = any(v_group_ids));
  end if;

  perform app_private.sync_product_addons_cache(p_product_id);

  return jsonb_build_object(
    'success', true,
    'group_ids', to_jsonb(v_group_ids)
  );
end;
$$;

revoke all on function public.save_product_addon_configuration(uuid, jsonb) from public;
revoke all on function public.save_product_addon_configuration(uuid, jsonb) from anon;
grant execute on function public.save_product_addon_configuration(uuid, jsonb) to authenticated;

-- Migrate every existing inline product group to its own canonical group.
do $$
declare
  r record;
  v_group_id uuid;
  v_options jsonb;
  v_option jsonb;
  v_option_id uuid;
  v_option_name text;
  v_option_price numeric;
begin
  for r in
    select
      p.id as product_id,
      p.restaurant_id,
      grp.value as group_json,
      grp.ordinality::integer as sort_order
    from public.products p
    cross join lateral jsonb_array_elements(coalesce(p.addons, '[]'::jsonb))
      with ordinality as grp(value, ordinality)
  loop
    begin
      v_group_id := (r.group_json->>'id')::uuid;
    exception when others then
      v_group_id := pg_catalog.gen_random_uuid();
    end;

    v_options := '[]'::jsonb;

    for v_option in
      select value
      from jsonb_array_elements(coalesce(r.group_json->'options', '[]'::jsonb))
    loop
      v_option_name := left(trim(coalesce(v_option->>'name', '')), 160);
      if v_option_name = '' then
        continue;
      end if;

      begin
        v_option_id := (v_option->>'id')::uuid;
      exception when others then
        v_option_id := pg_catalog.gen_random_uuid();
      end;

      if coalesce(v_option->>'price', '') ~ '^[0-9]+([.][0-9]+)?$' then
        v_option_price := greatest(0, (v_option->>'price')::numeric);
      else
        v_option_price := 0;
      end if;

      v_options := v_options || jsonb_build_array(
        jsonb_build_object(
          'id', v_option_id::text,
          'name', v_option_name,
          'price', v_option_price,
          'is_active', coalesce(nullif(v_option->>'is_active', '')::boolean, true)
        )
      );
    end loop;

    insert into public.addon_groups (
      id,
      restaurant_id,
      title,
      required,
      min_options,
      max_options,
      is_active,
      options
    )
    values (
      v_group_id,
      r.restaurant_id,
      left(coalesce(nullif(trim(r.group_json->>'title'), ''), 'Complementos'), 160),
      coalesce(nullif(r.group_json->>'required', '')::boolean, false),
      greatest(
        0,
        coalesce(
          nullif(r.group_json->>'min_options', '')::integer,
          case when coalesce(nullif(r.group_json->>'required', '')::boolean, false) then 1 else 0 end
        )
      ),
      greatest(0, coalesce(nullif(r.group_json->>'max_options', '')::integer, 0)),
      coalesce(nullif(r.group_json->>'is_active', '')::boolean, true),
      v_options
    )
    on conflict (id) do nothing;

    insert into public.product_addon_group_links (
      product_id,
      addon_group_id,
      sort_order
    )
    values (
      r.product_id,
      v_group_id,
      r.sort_order
    )
    on conflict (product_id, addon_group_id) do update
    set sort_order = excluded.sort_order;
  end loop;

  for r in
    select distinct product_id
    from public.product_addon_group_links
  loop
    perform app_private.sync_product_addons_cache(r.product_id);
  end loop;
end;
$$;

comment on table public.addon_groups is
  'Reusable addon groups. Editing/pausing one group affects every linked product.';
comment on table public.product_addon_group_links is
  'Links reusable addon groups to products; copying creates a new addon_groups row, linking reuses the same row.';
