-- Public storefront images remain readable, while writes are isolated by restaurant.
insert into storage.buckets (id, name, public)
values
  ('restaurant-images', 'restaurant-images', true),
  ('menu-images', 'menu-images', true)
on conflict (id) do update set public = excluded.public;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%restaurant-images%'
        or coalesce(qual, '') ilike '%menu-images%'
        or coalesce(with_check, '') ilike '%restaurant-images%'
        or coalesce(with_check, '') ilike '%menu-images%'
        or policyname like 'Shifuh %'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end;
$$;

create policy "Shifuh public image read"
on storage.objects for select
to public
using (bucket_id in ('restaurant-images', 'menu-images'));

create policy "Shifuh restaurant image insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('restaurant-images', 'menu-images')
  and exists (
    select 1 from public.restaurants
    where restaurants.id::text = (storage.foldername(name))[1]
      and restaurants.user_id = (select auth.uid())
  )
);

create policy "Shifuh restaurant image update"
on storage.objects for update
to authenticated
using (
  bucket_id in ('restaurant-images', 'menu-images')
  and exists (
    select 1 from public.restaurants
    where restaurants.id::text = (storage.foldername(name))[1]
      and restaurants.user_id = (select auth.uid())
  )
)
with check (
  bucket_id in ('restaurant-images', 'menu-images')
  and exists (
    select 1 from public.restaurants
    where restaurants.id::text = (storage.foldername(name))[1]
      and restaurants.user_id = (select auth.uid())
  )
);

create policy "Shifuh restaurant image delete"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('restaurant-images', 'menu-images')
  and exists (
    select 1 from public.restaurants
    where restaurants.id::text = (storage.foldername(name))[1]
      and restaurants.user_id = (select auth.uid())
  )
);
