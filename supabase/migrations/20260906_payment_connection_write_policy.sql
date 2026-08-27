-- Tenant admins may store encrypted provider credentials; plaintext never reaches the database.
drop policy if exists payment_connections_admin_write on public.payment_provider_connections;
create policy payment_connections_admin_write
on public.payment_provider_connections
for all to authenticated
using (organization_id = public.current_organization_id() and public.is_admin())
with check (organization_id = public.current_organization_id() and public.is_admin());
grant select, insert, update, delete on public.payment_provider_connections to authenticated;