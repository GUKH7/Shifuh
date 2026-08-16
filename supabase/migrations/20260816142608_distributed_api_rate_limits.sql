create table if not exists public.api_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists api_rate_limits_expires_at_idx on public.api_rate_limits (expires_at);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.consume_api_rate_limit(p_key_hash text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_rate_limit_key'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 100000 then raise exception 'invalid_rate_limit_limit'; end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then raise exception 'invalid_rate_limit_window'; end if;
  if pg_catalog.random() < 0.01 then
    with stale as (select key_hash from public.api_rate_limits where expires_at < v_now - interval '1 hour' order by expires_at asc limit 200)
    delete from public.api_rate_limits rl using stale where rl.key_hash = stale.key_hash;
  end if;
  return query
  insert into public.api_rate_limits as rl (key_hash, window_started_at, request_count, expires_at, updated_at)
  values (p_key_hash, v_now, 1, v_now + pg_catalog.make_interval(secs => p_window_seconds), v_now)
  on conflict (key_hash) do update set
    window_started_at = case when rl.expires_at <= v_now then v_now else rl.window_started_at end,
    request_count = case when rl.expires_at <= v_now then 1 else rl.request_count + 1 end,
    expires_at = case when rl.expires_at <= v_now then v_now + pg_catalog.make_interval(secs => p_window_seconds) else rl.expires_at end,
    updated_at = v_now
  returning rl.request_count <= p_limit, greatest(p_limit - rl.request_count, 0), rl.expires_at;
end;
$$;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to service_role;
