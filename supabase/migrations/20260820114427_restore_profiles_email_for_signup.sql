alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

comment on column public.profiles.email is
  'Email mirror from auth.users used by the signup profile trigger; protected by profile RLS.';
