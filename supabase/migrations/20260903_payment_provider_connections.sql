create table if not exists public.payment_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null,
  merchant_code text not null,
  encrypted_credentials bytea not null,
  credential_iv bytea not null,
  active boolean not null default true,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz
);
alter table public.payment_provider_connections enable row level security;
create policy payment_connections_admin_read on public.payment_provider_connections for select to authenticated using (organization_id=public.current_organization_id() and public.is_admin());
