-- Fase 1: convierte el modelo de un salon a organizaciones y sucursales.
-- Es segura para una base existente: todos los datos actuales quedan en Legacy Salon.

create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  timezone text not null default 'America/Santiago',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.user_branch_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (branch_id, user_id)
);

create table if not exists public.professional_branches (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_id text not null references public.professionals(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (professional_id, branch_id)
);

-- Constantes deterministas para la migracion del salon unico ya existente.
insert into public.organizations (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Legacy Salon', 'legacy-salon')
on conflict (id) do nothing;

insert into public.branches (id, organization_id, name, timezone)
values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Sucursal principal', 'America/Santiago')
on conflict (id) do nothing;

alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.profiles add column if not exists active_branch_id uuid references public.branches(id) on delete set null;

alter table public.settings drop constraint if exists settings_id_check;
alter table public.service_categories drop constraint if exists service_categories_name_key;
alter table public.product_categories drop constraint if exists product_categories_name_key;
alter table public.expense_categories drop constraint if exists expense_categories_name_key;
alter table public.products drop constraint if exists products_sku_key;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settings', 'professionals', 'clients', 'service_categories', 'product_categories',
    'expense_categories', 'services', 'products', 'appointments', 'appointment_services',
    'sales', 'sale_items', 'payments', 'purchases', 'purchase_items', 'expenses',
    'inventory_movements', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete restrict', table_name);
  end loop;

  foreach table_name in array array[
    'products', 'appointments', 'appointment_services', 'sales', 'sale_items', 'payments',
    'purchases', 'purchase_items', 'expenses', 'inventory_movements', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I add column if not exists branch_id uuid references public.branches(id) on delete restrict', table_name);
  end loop;
end $$;

-- Asigna los registros existentes una sola vez. Los nuevos registros deben traer alcance explicito.
update public.profiles set organization_id = '00000000-0000-4000-8000-000000000001', active_branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.settings set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.professionals set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.clients set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.service_categories set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.product_categories set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.expense_categories set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.services set organization_id = '00000000-0000-4000-8000-000000000001' where organization_id is null;
update public.products set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.appointments set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.appointment_services set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.sales set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.sale_items set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.payments set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.purchases set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.purchase_items set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.expenses set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.inventory_movements set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;
update public.audit_logs set organization_id = '00000000-0000-4000-8000-000000000001', branch_id = '00000000-0000-4000-8000-000000000002' where organization_id is null;

insert into public.organization_members (organization_id, user_id, role, active)
select organization_id, id, role, active from public.profiles where organization_id is not null
on conflict (organization_id, user_id) do update set role = excluded.role, active = excluded.active;

insert into public.user_branch_access (organization_id, branch_id, user_id, active)
select organization_id, active_branch_id, id, active from public.profiles where organization_id is not null and active_branch_id is not null
on conflict (branch_id, user_id) do update set active = excluded.active;

insert into public.professional_branches (organization_id, professional_id, branch_id)
select organization_id, id, '00000000-0000-4000-8000-000000000002' from public.professionals where organization_id is not null
on conflict do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settings', 'professionals', 'clients', 'service_categories', 'product_categories',
    'expense_categories', 'services', 'products', 'appointments', 'appointment_services',
    'sales', 'sale_items', 'payments', 'purchases', 'purchase_items', 'expenses',
    'inventory_movements', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I alter column organization_id set not null', table_name);
  end loop;
  foreach table_name in array array[
    'products', 'appointments', 'appointment_services', 'sales', 'sale_items', 'payments',
    'purchases', 'purchase_items', 'expenses', 'inventory_movements', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I alter column branch_id set not null', table_name);
  end loop;
end $$;

create unique index if not exists settings_organization_unique on public.settings (organization_id);
create unique index if not exists service_categories_organization_name_unique on public.service_categories (organization_id, name);
create unique index if not exists product_categories_organization_name_unique on public.product_categories (organization_id, name);
create unique index if not exists expense_categories_organization_name_unique on public.expense_categories (organization_id, name);
create unique index if not exists products_organization_branch_sku_unique on public.products (organization_id, branch_id, sku);
create index if not exists appointments_tenant_start_idx on public.appointments (organization_id, branch_id, start_at);
create index if not exists sales_tenant_sold_at_idx on public.sales (organization_id, branch_id, sold_at);
create index if not exists clients_tenant_name_idx on public.clients (organization_id, full_name);

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid() and active = true
$$;

create or replace function public.has_branch_access(p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_branch_access access
    where access.user_id = auth.uid()
      and access.branch_id = p_branch_id
      and access.organization_id = public.current_organization_id()
      and access.active = true
  )
$$;

create or replace function public.app_tenant_context()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.organization_id is null then
    new.organization_id := nullif(current_setting('app.organization_id', true), '')::uuid;
  end if;
  if tg_table_name in ('products', 'appointments', 'appointment_services', 'sales', 'sale_items', 'payments', 'purchases', 'purchase_items', 'expenses', 'inventory_movements', 'audit_logs') and new.branch_id is null then
    new.branch_id := nullif(current_setting('app.branch_id', true), '')::uuid;
  end if;
  if new.organization_id is null then
    raise exception 'Falta el contexto de organizacion.';
  end if;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settings', 'professionals', 'clients', 'service_categories', 'product_categories',
    'expense_categories', 'services', 'products', 'appointments', 'appointment_services',
    'sales', 'sale_items', 'payments', 'purchases', 'purchase_items', 'expenses',
    'inventory_movements', 'audit_logs'
  ] loop
    execute format('drop trigger if exists tenant_context_before_write on public.%I', table_name);
    execute format('create trigger tenant_context_before_write before insert on public.%I for each row execute function public.app_tenant_context()', table_name);
  end loop;
end $$;

-- Las funciones transaccionales anteriores se preservan; estos wrappers fijan el tenant
-- y verifican que los IDs recibidos pertenecen al tenant antes de delegar la transaccion.
create or replace function public.tenant_create_appointment_transaction(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin
  if not exists (select 1 from public.clients where id = payload->>'clientId' and organization_id = v_org)
     or not exists (select 1 from public.professionals where id = payload->>'professionalId' and organization_id = v_org)
     or not exists (select 1 from public.professional_branches where professional_id = payload->>'professionalId' and branch_id = v_branch and active) then raise exception 'Cliente, profesional o sucursal fuera de la organizacion.'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(payload->'services','[]'::jsonb)) as line("serviceId" text) left join public.services s on s.id=line."serviceId" and s.organization_id=v_org where s.id is null) then raise exception 'Servicio fuera de la organizacion.'; end if;
  perform set_config('app.organization_id', v_org::text, true); perform set_config('app.branch_id', v_branch::text, true);
  perform public.create_appointment_transaction(payload - 'organizationId' - 'branchId');
end $$;

create or replace function public.tenant_update_appointment_status_transaction(p_appointment_id text, p_status public.appointment_status, p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.appointments where id=p_appointment_id and organization_id=p_organization_id) then raise exception 'Cita no encontrada.'; end if;
  perform set_config('app.organization_id', p_organization_id::text, true);
  perform public.update_appointment_status_transaction(p_appointment_id, p_status);
end $$;

create or replace function public.tenant_convert_appointment_to_sale_transaction(p_appointment_id text, p_sale_id text, p_sold_at timestamptz, p_notes text, p_organization_id uuid, p_branch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.appointments where id=p_appointment_id and organization_id=p_organization_id and branch_id=p_branch_id) then raise exception 'Cita no encontrada.'; end if;
  perform set_config('app.organization_id', p_organization_id::text, true); perform set_config('app.branch_id', p_branch_id::text, true);
  perform public.convert_appointment_to_sale_transaction(p_appointment_id, p_sale_id, p_sold_at, p_notes);
end $$;

create or replace function public.tenant_create_manual_sale_transaction(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin
  if not exists (select 1 from public.clients where id=payload->>'clientId' and organization_id=v_org)
     or not exists (select 1 from public.professionals where id=payload->>'professionalId' and organization_id=v_org) then raise exception 'Cliente o profesional fuera de la organizacion.'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb)) as item(type text, "referenceId" text) where (type='service' and not exists (select 1 from public.services where id=item."referenceId" and organization_id=v_org)) or (type='product' and not exists (select 1 from public.products where id=item."referenceId" and organization_id=v_org and branch_id=v_branch))) then raise exception 'Item fuera de la organizacion.'; end if;
  perform set_config('app.organization_id', v_org::text, true); perform set_config('app.branch_id', v_branch::text, true);
  perform public.create_manual_sale_transaction(payload - 'organizationId' - 'branchId');
end $$;

create or replace function public.tenant_record_payment_transaction(p_sale_id text, p_payment_id text, p_amount numeric, p_method public.payment_method, p_paid_at timestamptz, p_note text, p_organization_id uuid, p_branch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sales where id=p_sale_id and organization_id=p_organization_id and branch_id=p_branch_id) then raise exception 'Venta no encontrada.'; end if;
  perform set_config('app.organization_id', p_organization_id::text, true); perform set_config('app.branch_id', p_branch_id::text, true);
  perform public.record_payment_transaction(p_sale_id, p_payment_id, p_amount, p_method, p_paid_at, p_note);
end $$;

create or replace function public.tenant_create_purchase_transaction(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin
  if exists (select 1 from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb)) as item("productId" text) where not exists (select 1 from public.products where id=item."productId" and organization_id=v_org and branch_id=v_branch)) then raise exception 'Producto fuera de la organizacion.'; end if;
  perform set_config('app.organization_id', v_org::text, true); perform set_config('app.branch_id', v_branch::text, true);
  perform public.create_purchase_transaction(payload - 'organizationId' - 'branchId');
end $$;

create or replace function public.tenant_adjust_stock_transaction(p_product_id text, p_movement_id text, p_quantity_change numeric, p_happened_at timestamptz, p_note text, p_organization_id uuid, p_branch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.products where id=p_product_id and organization_id=p_organization_id and branch_id=p_branch_id) then raise exception 'Producto no encontrado.'; end if;
  perform set_config('app.organization_id', p_organization_id::text, true); perform set_config('app.branch_id', p_branch_id::text, true);
  perform public.adjust_stock_transaction(p_product_id, p_movement_id, p_quantity_change, p_happened_at, p_note);
end $$;

create or replace function public.tenant_create_expense_transaction(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin
  perform set_config('app.organization_id', v_org::text, true); perform set_config('app.branch_id', v_branch::text, true);
  perform public.create_expense_transaction(payload - 'organizationId' - 'branchId');
end $$;

revoke execute on function public.tenant_create_appointment_transaction(jsonb), public.tenant_update_appointment_status_transaction(text, public.appointment_status, uuid), public.tenant_convert_appointment_to_sale_transaction(text, text, timestamptz, text, uuid, uuid), public.tenant_create_manual_sale_transaction(jsonb), public.tenant_record_payment_transaction(text, text, numeric, public.payment_method, timestamptz, text, uuid, uuid), public.tenant_create_purchase_transaction(jsonb), public.tenant_adjust_stock_transaction(text, text, numeric, timestamptz, text, uuid, uuid), public.tenant_create_expense_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.tenant_create_appointment_transaction(jsonb), public.tenant_update_appointment_status_transaction(text, public.appointment_status, uuid), public.tenant_convert_appointment_to_sale_transaction(text, text, timestamptz, text, uuid, uuid), public.tenant_create_manual_sale_transaction(jsonb), public.tenant_record_payment_transaction(text, text, numeric, public.payment_method, timestamptz, text, uuid, uuid), public.tenant_create_purchase_transaction(jsonb), public.tenant_adjust_stock_transaction(text, text, numeric, timestamptz, text, uuid, uuid), public.tenant_create_expense_transaction(jsonb) to service_role;

-- RLS: borra politicas de salon unico y reemplaza por reglas de tenant + sucursal.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in ('settings','profiles','professionals','clients','service_categories','product_categories','expense_categories','services','products','appointments','appointment_services','sales','sale_items','payments','purchases','purchase_items','expenses','inventory_movements','audit_logs','organizations','branches','organization_members','user_branch_access','professional_branches') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.branches enable row level security;
alter table public.organization_members enable row level security;
alter table public.user_branch_access enable row level security;
alter table public.professional_branches enable row level security;

create policy organizations_member_read on public.organizations for select to authenticated using (id = public.current_organization_id());
create policy branches_member_read on public.branches for select to authenticated using (organization_id = public.current_organization_id() and public.has_branch_access(id));
create policy members_self_or_admin on public.organization_members for select to authenticated using (user_id = auth.uid() or (organization_id = public.current_organization_id() and public.is_admin()));
create policy members_admin_manage on public.organization_members for all to authenticated using (organization_id = public.current_organization_id() and public.is_admin()) with check (organization_id = public.current_organization_id() and public.is_admin());
create policy branch_access_self_or_admin on public.user_branch_access for select to authenticated using (user_id = auth.uid() or (organization_id = public.current_organization_id() and public.is_admin()));
create policy branch_access_admin_manage on public.user_branch_access for all to authenticated using (organization_id = public.current_organization_id() and public.is_admin()) with check (organization_id = public.current_organization_id() and public.is_admin());
create policy professional_branches_tenant_read on public.professional_branches for select to authenticated using (organization_id = public.current_organization_id() and public.has_branch_access(branch_id));
create policy professional_branches_admin_manage on public.professional_branches for all to authenticated using (organization_id = public.current_organization_id() and public.is_admin()) with check (organization_id = public.current_organization_id() and public.is_admin());
create policy profiles_tenant_read on public.profiles for select to authenticated using (id = auth.uid() or (organization_id = public.current_organization_id() and public.is_admin()));
create policy profiles_admin_manage on public.profiles for all to authenticated using (organization_id = public.current_organization_id() and public.is_admin()) with check (organization_id = public.current_organization_id() and public.is_admin());

do $$
declare table_name text;
begin
  foreach table_name in array array['settings','professionals','clients','service_categories','product_categories','expense_categories','services'] loop
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id())', table_name || '_tenant_read', table_name);
  end loop;
  foreach table_name in array array['products','appointments','appointment_services','sales','sale_items','payments','purchases','purchase_items','expenses','inventory_movements','audit_logs'] loop
    execute format('create policy %I on public.%I for select to authenticated using (organization_id = public.current_organization_id() and public.has_branch_access(branch_id))', table_name || '_tenant_branch_read', table_name);
  end loop;
end $$;

-- Las escrituras de negocio se realizan por Server Actions/RPC con validacion de rol.
-- Esta politica solo permite mutacion directa a administradores del mismo tenant.
do $$
declare table_name text;
begin
  foreach table_name in array array['settings','professionals','clients','service_categories','product_categories','expense_categories','services'] loop
    execute format('create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.is_admin()) with check (organization_id = public.current_organization_id() and public.is_admin())', table_name || '_tenant_admin_write', table_name);
  end loop;
  foreach table_name in array array['products','appointments','appointment_services','sales','sale_items','payments','purchases','purchase_items','expenses','inventory_movements','audit_logs'] loop
    execute format('create policy %I on public.%I for all to authenticated using (organization_id = public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin()) with check (organization_id = public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin())', table_name || '_tenant_branch_admin_write', table_name);
  end loop;
end $$;

revoke execute on function public.current_organization_id(), public.has_branch_access(uuid), public.app_tenant_context() from public, anon;
grant execute on function public.current_organization_id(), public.has_branch_access(uuid) to authenticated, service_role;
revoke execute on function public.app_tenant_context() from public, anon, authenticated;
