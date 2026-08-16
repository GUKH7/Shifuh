drop policy if exists "Service role manages API rate limits" on public.api_rate_limits;
create policy "Service role manages API rate limits"
on public.api_rate_limits for all to service_role using (true) with check (true);
