alter table public.expenses add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
alter table public.expenses add column if not exists payment_status text not null default 'paid' check(payment_status in ('paid','pending'));
alter table public.expenses add column if not exists payment_method public.payment_method;
alter table public.expenses add column if not exists paid_at timestamptz;

create or replace function public.tenant_create_expense_transaction(payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid; v_supplier uuid := nullif(payload->>'supplierId','')::uuid; v_status text := coalesce(payload->>'paymentStatus','paid');
begin
  perform public.assert_tenant_access(v_org,v_branch);
  if not exists(select 1 from public.expense_categories where id=payload->>'categoryId' and organization_id=v_org) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if v_supplier is not null and not exists(select 1 from public.suppliers where id=v_supplier and organization_id=v_org and active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if v_status not in ('paid','pending') then raise exception 'Invalid payment status' using errcode='P0002'; end if;
  perform set_config('app.organization_id',v_org::text,true); perform set_config('app.branch_id',v_branch::text,true);
  perform public.create_expense_transaction(payload-'organizationId'-'branchId'-'supplierId'-'paymentStatus'-'paymentMethod');
  update public.expenses set supplier_id=v_supplier,payment_status=v_status,payment_method=case when v_status='paid' then nullif(payload->>'paymentMethod','')::public.payment_method else null end,paid_at=case when v_status='paid' then (payload->>'spentAt')::timestamptz else null end where id=payload->>'id' and organization_id=v_org and branch_id=v_branch;
end $$;
grant execute on function public.tenant_create_expense_transaction(jsonb) to authenticated;