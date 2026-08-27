create or replace function public.app_tenant_context()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is null then new.organization_id := nullif(current_setting('app.organization_id', true), '')::uuid; end if;
  if new.organization_id is null then raise exception 'Falta el contexto de organizacion.'; end if;
  return new;
end $$;

create or replace function public.app_branch_tenant_context()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.organization_id is null then new.organization_id := nullif(current_setting('app.organization_id', true), '')::uuid; end if;
  if new.branch_id is null then new.branch_id := nullif(current_setting('app.branch_id', true), '')::uuid; end if;
  if new.organization_id is null or new.branch_id is null then raise exception 'Falta el contexto de sucursal.'; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['products','appointments','appointment_services','sales','sale_items','payments','purchases','purchase_items','expenses','inventory_movements','audit_logs'] loop
    execute format('drop trigger if exists tenant_context_before_write on public.%I',t);
    execute format('create trigger tenant_context_before_write before insert on public.%I for each row execute function public.app_branch_tenant_context()',t);
  end loop;
end $$;
