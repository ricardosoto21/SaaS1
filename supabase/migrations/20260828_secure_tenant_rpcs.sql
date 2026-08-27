create or replace function public.assert_tenant_access(p_organization_id uuid, p_branch_id uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or p_organization_id is distinct from public.current_organization_id()
     or (p_branch_id is not null and not public.has_branch_access(p_branch_id)) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
end $$;

create or replace function public.tenant_create_appointment_transaction(payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin
  perform public.assert_tenant_access(v_org, v_branch);
  if not exists (select 1 from public.clients where id=payload->>'clientId' and organization_id=v_org)
     or not exists (select 1 from public.professionals p join public.professional_branches pb on pb.professional_id=p.id where p.id=payload->>'professionalId' and p.organization_id=v_org and pb.branch_id=v_branch and pb.active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  perform set_config('app.organization_id', v_org::text, true); perform set_config('app.branch_id', v_branch::text, true);
  perform public.create_appointment_transaction(payload - 'organizationId' - 'branchId');
end $$;

create or replace function public.tenant_update_appointment_status_transaction(p_appointment_id text, p_status public.appointment_status, p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_tenant_access(p_organization_id, (select branch_id from public.appointments where id=p_appointment_id and organization_id=p_organization_id));
  if not exists (select 1 from public.appointments where id=p_appointment_id and organization_id=p_organization_id) then raise exception 'Resource not found' using errcode='P0002'; end if;
  perform set_config('app.organization_id', p_organization_id::text, true); perform public.update_appointment_status_transaction(p_appointment_id, p_status);
end $$;

create or replace function public.tenant_convert_appointment_to_sale_transaction(p_appointment_id text,p_sale_id text,p_sold_at timestamptz,p_notes text,p_organization_id uuid,p_branch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_tenant_access(p_organization_id,p_branch_id); if not exists(select 1 from public.appointments where id=p_appointment_id and organization_id=p_organization_id and branch_id=p_branch_id) then raise exception 'Resource not found' using errcode='P0002'; end if; perform set_config('app.organization_id',p_organization_id::text,true); perform set_config('app.branch_id',p_branch_id::text,true); perform public.convert_appointment_to_sale_transaction(p_appointment_id,p_sale_id,p_sold_at,p_notes); end $$;

create or replace function public.tenant_record_payment_transaction(p_sale_id text,p_payment_id text,p_amount numeric,p_method public.payment_method,p_paid_at timestamptz,p_note text,p_organization_id uuid,p_branch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin perform public.assert_tenant_access(p_organization_id,p_branch_id); if not exists(select 1 from public.sales where id=p_sale_id and organization_id=p_organization_id and branch_id=p_branch_id) then raise exception 'Resource not found' using errcode='P0002'; end if; perform set_config('app.organization_id',p_organization_id::text,true); perform set_config('app.branch_id',p_branch_id::text,true); perform public.record_payment_transaction(p_sale_id,p_payment_id,p_amount,p_method,p_paid_at,p_note); end $$;

create or replace function public.tenant_create_manual_sale_transaction(payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin perform public.assert_tenant_access(v_org,v_branch); if not exists(select 1 from public.clients where id=payload->>'clientId' and organization_id=v_org) or not exists(select 1 from public.professionals where id=payload->>'professionalId' and organization_id=v_org) then raise exception 'Resource not found' using errcode='P0002'; end if; if exists(select 1 from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb)) x(type text,"referenceId" text) where (type='service' and not exists(select 1 from public.services where id=x."referenceId" and organization_id=v_org)) or (type='product' and not exists(select 1 from public.products where id=x."referenceId" and organization_id=v_org and branch_id=v_branch))) then raise exception 'Resource not found' using errcode='P0002'; end if; perform set_config('app.organization_id',v_org::text,true); perform set_config('app.branch_id',v_branch::text,true); perform public.create_manual_sale_transaction(payload-'organizationId'-'branchId'); end $$;

create or replace function public.tenant_create_purchase_transaction(payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin perform public.assert_tenant_access(v_org,v_branch); if exists(select 1 from jsonb_to_recordset(coalesce(payload->'items','[]'::jsonb)) x("productId" text) where not exists(select 1 from public.products where id=x."productId" and organization_id=v_org and branch_id=v_branch)) then raise exception 'Resource not found' using errcode='P0002'; end if; perform set_config('app.organization_id',v_org::text,true); perform set_config('app.branch_id',v_branch::text,true); perform public.create_purchase_transaction(payload-'organizationId'-'branchId'); end $$;

create or replace function public.tenant_adjust_stock_transaction(p_product_id text,p_movement_id text,p_quantity_change numeric,p_happened_at timestamptz,p_note text,p_organization_id uuid,p_branch_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin perform public.assert_tenant_access(p_organization_id,p_branch_id); if not exists(select 1 from public.products where id=p_product_id and organization_id=p_organization_id and branch_id=p_branch_id) then raise exception 'Resource not found' using errcode='P0002'; end if; perform set_config('app.organization_id',p_organization_id::text,true); perform set_config('app.branch_id',p_branch_id::text,true); perform public.adjust_stock_transaction(p_product_id,p_movement_id,p_quantity_change,p_happened_at,p_note); end $$;

create or replace function public.tenant_create_expense_transaction(payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid;
begin perform public.assert_tenant_access(v_org,v_branch); if not exists(select 1 from public.expense_categories where id=payload->>'categoryId' and organization_id=v_org) then raise exception 'Resource not found' using errcode='P0002'; end if; perform set_config('app.organization_id',v_org::text,true); perform set_config('app.branch_id',v_branch::text,true); perform public.create_expense_transaction(payload-'organizationId'-'branchId'); end $$;

grant execute on function public.assert_tenant_access(uuid,uuid), public.tenant_create_appointment_transaction(jsonb), public.tenant_update_appointment_status_transaction(text,public.appointment_status,uuid), public.tenant_convert_appointment_to_sale_transaction(text,text,timestamptz,text,uuid,uuid), public.tenant_record_payment_transaction(text,text,numeric,public.payment_method,timestamptz,text,uuid,uuid) to authenticated;
grant execute on function public.tenant_create_manual_sale_transaction(jsonb), public.tenant_create_purchase_transaction(jsonb), public.tenant_adjust_stock_transaction(text,text,numeric,timestamptz,text,uuid,uuid), public.tenant_create_expense_transaction(jsonb) to authenticated;
