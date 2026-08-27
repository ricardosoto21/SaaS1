create type public.inventory_movement_kind as enum ('purchase','sale','adjustment','return','transfer_in','transfer_out');

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  legal_name text,
  tax_id text,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);
create table if not exists public.branch_inventory (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  quantity numeric(12,2) not null default 0,
  reorder_point numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key(branch_id, product_id),
  check(quantity >= 0)
);
alter table public.purchases add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.purchases add column if not exists amount_paid numeric(12,2) not null default 0;
alter table public.purchases add column if not exists amount_due numeric(12,2) not null default 0;
alter table public.purchases add column if not exists document_reference text;
alter table public.inventory_movements add column if not exists stock_before numeric(12,2);
alter table public.inventory_movements add column if not exists stock_after numeric(12,2);
alter table public.inventory_movements add column if not exists actor_id uuid references auth.users(id) on delete set null;

insert into public.branch_inventory(organization_id,branch_id,product_id,quantity)
select organization_id,branch_id,id,current_stock from public.products
on conflict(branch_id,product_id) do nothing;

alter table public.suppliers enable row level security;
alter table public.branch_inventory enable row level security;
create policy suppliers_tenant_read on public.suppliers for select to authenticated using (organization_id=public.current_organization_id());
create policy suppliers_tenant_write on public.suppliers for all to authenticated using (organization_id=public.current_organization_id() and public.is_admin()) with check (organization_id=public.current_organization_id() and public.is_admin());
create policy inventory_branch_read on public.branch_inventory for select to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id));
create policy inventory_branch_write on public.branch_inventory for all to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin()) with check (organization_id=public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin());
grant select,insert,update,delete on public.suppliers,public.branch_inventory to authenticated;