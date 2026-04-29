alter table public.restaurants
  add column if not exists printer_auto_print boolean not null default false;
