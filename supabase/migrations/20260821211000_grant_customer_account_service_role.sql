-- Customer account/session tables are server-only. They are accessed exclusively
-- through createAdminClient(), so keep browser roles locked out while granting the
-- minimum table privileges required by the service-role workflows.

revoke all on table public.customer_phone_accounts from public, anon, authenticated;
revoke all on table public.customer_phone_sessions from public, anon, authenticated;

grant select, insert, update on table public.customer_phone_accounts to service_role;
grant select, insert, delete on table public.customer_phone_sessions to service_role;
