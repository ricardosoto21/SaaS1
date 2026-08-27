create or replace function public.tenant_create_purchase_transaction(payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid; v_supplier uuid := nullif(payload->>'supplierId','')::uuid; v_paid numeric := greatest(0,coalesce((payload->>'amountPaid')::numeric,0)); v_total numeric;
begin
  perform public.assert_tenant_access(v_org,v_branch);
  if exists(select 1 from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb)) x("productId" text) where not exists(select 1 from public.products where id=x."productId" and organization_id=v_org and branch_id=v_branch)) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if v_supplier is not null and not exists(select 1 from public.suppliers where id=v_supplier and organization_id=v_org and active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  perform set_config('app.organization_id',v_org::text,true); perform set_config('app.branch_id',v_branch::text,true);
  perform public.create_purchase_transaction(payload-'organizationId'-'branchId'-'supplierId'-'amountPaid');
  select total into v_total from public.purchases where id=payload->>'id' and organization_id=v_org and branch_id=v_branch;
  if v_paid>v_total then raise exception 'Payment exceeds purchase total' using errcode='P0002'; end if;
  update public.purchases set supplier_id=v_supplier,amount_paid=v_paid,amount_due=v_total-v_paid where id=payload->>'id' and organization_id=v_org and branch_id=v_branch;
end $$;
grant execute on function public.tenant_create_purchase_transaction(jsonb) to authenticated;