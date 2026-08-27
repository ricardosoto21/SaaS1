-- Snapshot resolved commercial terms in a booking hold and reuse them when payment confirms.
create or replace function public.create_public_booking_hold(p_slug text, p_branch_id uuid, p_professional_id text, p_start_at timestamptz, p_services jsonb, p_client_name text, p_client_phone text, p_client_email text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_duration integer; v_total numeric; v_expected_count integer; v_available_count integer; v_lines jsonb; v_end timestamptz; v_hold public.booking_holds%rowtype;
begin
  select id into v_org from public.organizations where slug=p_slug and active;
  if v_org is null or not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org and active) or not exists(select 1 from public.professional_branches where organization_id=v_org and branch_id=p_branch_id and professional_id=p_professional_id and active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 or jsonb_array_length(p_services)>8 then raise exception 'Invalid services' using errcode='P0002'; end if;
  select count(*) into v_expected_count from jsonb_to_recordset(p_services) input(service_id text);
  select count(*),coalesce(sum(offer.duration_minutes),0),coalesce(sum(offer.price),0),coalesce(jsonb_agg(jsonb_build_object('service_id',input.service_id,'price',offer.price,'duration_minutes',offer.duration_minutes)),'[]'::jsonb) into v_available_count,v_duration,v_total,v_lines from jsonb_to_recordset(p_services) input(service_id text) cross join lateral public.resolve_service_offer_internal(v_org,p_branch_id,p_professional_id,input.service_id) offer where offer.available;
  if v_available_count <> v_expected_count or v_duration <= 0 then raise exception 'Service unavailable' using errcode='P0002'; end if;
  v_end:=p_start_at + v_duration * interval '1 minute';
  perform public.ensure_professional_availability(p_professional_id,p_branch_id,p_start_at,v_duration);
  if exists(select 1 from public.appointments where organization_id=v_org and professional_id=p_professional_id and branch_id=p_branch_id and status in ('scheduled','confirmed') and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) or exists(select 1 from public.booking_holds where organization_id=v_org and professional_id=p_professional_id and branch_id=p_branch_id and status='pending_payment' and expires_at>now() and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) then raise exception 'Time unavailable' using errcode='23P01'; end if;
  insert into public.booking_holds(organization_id,branch_id,professional_id,client_name,client_phone,client_email,start_at,ends_at,services,total,deposit_amount,expires_at) values(v_org,p_branch_id,p_professional_id,trim(p_client_name),trim(p_client_phone),nullif(trim(p_client_email),''),p_start_at,v_end,v_lines,v_total,v_total*0.5,now()+interval '15 minutes') returning * into v_hold;
  return jsonb_build_object('holdId',v_hold.id,'depositAmount',v_hold.deposit_amount,'expiresAt',v_hold.expires_at);
end $$;

create or replace function public.confirm_public_booking_payment(p_hold_id uuid,p_provider text,p_checkout_id text,p_paid_amount numeric)
returns text language plpgsql security definer set search_path=public as $$
declare h public.booking_holds%rowtype; v_client_id text; v_appointment_id text; v_sale_id text; v_line record;
begin
  select * into h from public.booking_holds where id=p_hold_id for update;
  if not found then raise exception 'Resource not found' using errcode='P0002'; end if;
  if h.status='converted' then return h.appointment_id; end if;
  if h.status<>'pending_payment' or h.expires_at<=now() then raise exception 'Hold expired' using errcode='P0002'; end if;
  if p_provider<>'sumup' or p_checkout_id='' or p_paid_amount<>h.deposit_amount then raise exception 'Payment verification failed' using errcode='P0002'; end if;
  select id into v_client_id from public.clients where organization_id=h.organization_id and phone=h.client_phone order by created_at asc limit 1;
  if v_client_id is null then v_client_id:='client-'||gen_random_uuid()::text; insert into public.clients(id,organization_id,full_name,phone,email,preferences,notes) values(v_client_id,h.organization_id,h.client_name,h.client_phone,h.client_email,'','Reserva online'); end if;
  v_appointment_id:='appointment-'||gen_random_uuid()::text; v_sale_id:='sale-'||gen_random_uuid()::text;
  insert into public.appointments(id,organization_id,branch_id,client_id,professional_id,start_at,ends_at,status,notes,estimated_total,total_duration_minutes,sale_id) values(v_appointment_id,h.organization_id,h.branch_id,v_client_id,h.professional_id,h.start_at,h.ends_at,'confirmed','Reserva online con anticipo',h.total,extract(epoch from h.ends_at-h.start_at)/60,v_sale_id);
  insert into public.sales(id,organization_id,branch_id,client_id,professional_id,appointment_id,origin,sold_at,notes,total,amount_paid,amount_due,payment_status) values(v_sale_id,h.organization_id,h.branch_id,v_client_id,h.professional_id,v_appointment_id,'appointment',now(),'Anticipo de reserva online',h.total,h.deposit_amount,h.total-h.deposit_amount,'partial');
  for v_line in select service.id,service.name,category.name as category_name,coalesce(input.price,service.base_price) as price,coalesce(input.duration_minutes,service.duration_minutes) as duration_minutes from jsonb_to_recordset(h.services) input(service_id text,price numeric,duration_minutes integer) join public.services service on service.id=input.service_id and service.organization_id=h.organization_id join public.service_categories category on category.id=service.category_id loop
    insert into public.appointment_services(id,organization_id,branch_id,appointment_id,service_id,price,duration_minutes,notes) values('appointment-service-'||gen_random_uuid()::text,h.organization_id,h.branch_id,v_appointment_id,v_line.id,v_line.price,v_line.duration_minutes,'Reserva online');
    insert into public.sale_items(id,organization_id,branch_id,sale_id,item_type,service_id,item_name,category_name,quantity,unit_price,total) values('sale-item-'||gen_random_uuid()::text,h.organization_id,h.branch_id,v_sale_id,'service',v_line.id,v_line.name,v_line.category_name,1,v_line.price,v_line.price);
  end loop;
  insert into public.payments(id,organization_id,branch_id,sale_id,amount,method,paid_at,note) values('payment-'||gen_random_uuid()::text,h.organization_id,h.branch_id,v_sale_id,h.deposit_amount,'online',now(),'Anticipo SumUp: '||left(p_checkout_id,120));
  update public.booking_holds set status='converted',appointment_id=v_appointment_id where id=h.id;
  insert into public.audit_logs(organization_id,branch_id,actor_email,action,entity_type,entity_id,details) values(h.organization_id,h.branch_id,'payment-webhook','booking_payment_confirmed','appointment',v_appointment_id,jsonb_build_object('provider',p_provider,'checkoutId',p_checkout_id,'deposit',h.deposit_amount));
  return v_appointment_id;
end $$;
revoke all on function public.confirm_public_booking_payment(uuid,text,text,numeric) from public,anon,authenticated;