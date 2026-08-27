-- Fase 1 closure: reject cross-organization branch references even for privileged writers.
-- RLS protects authenticated requests; this trigger is the database backstop.

create or replace function public.assert_branch_matches_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.branches branch
    where branch.id = new.branch_id
      and branch.organization_id = new.organization_id
  ) then
    raise exception 'Invalid tenant branch reference' using errcode = '23514';
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'products', 'appointments', 'appointment_services', 'sales', 'sale_items',
    'payments', 'purchases', 'purchase_items', 'expenses', 'inventory_movements',
    'audit_logs', 'professional_branches', 'user_branch_access'
  ] loop
    execute format('drop trigger if exists tenant_branch_integrity_before_write on public.%I', table_name);
    execute format(
      'create trigger tenant_branch_integrity_before_write before insert or update of organization_id, branch_id on public.%I for each row execute function public.assert_branch_matches_organization()',
      table_name
    );
  end loop;
end $$;

-- A professional can only be assigned inside its own organization.
create or replace function public.assert_professional_branch_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.professionals professional
    where professional.id = new.professional_id
      and professional.organization_id = new.organization_id
  ) then
    raise exception 'Invalid professional tenant reference' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists professional_branch_tenant_integrity_before_write on public.professional_branches;
create trigger professional_branch_tenant_integrity_before_write
before insert or update of organization_id, professional_id on public.professional_branches
for each row execute function public.assert_professional_branch_tenant();

revoke all on function public.assert_branch_matches_organization() from public, anon, authenticated;
revoke all on function public.assert_professional_branch_tenant() from public, anon, authenticated;