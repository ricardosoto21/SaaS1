-- Client-managed booking links use an opaque token stored only as a hash.
drop function if exists public.create_public_booking_hold(text,uuid,text,timestamptz,jsonb,text,text,text);
alter table public.booking_holds add column if not exists client_access_token_hash text;
create unique index if not exists booking_holds_client_access_token_hash_idx on public.booking_holds(client_access_token_hash) where client_access_token_hash is not null;

create or replace function public.create_public_booking_hold(p_slug text,p_branch_id uuid,p_professional_id text,p_start_at timestamptz,p_services jsonb,p_client_name text,p_client_phone text,p_client_email text default null,p_client_access_token_hash text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_duration integer; v_total numeric; v_expected_count integer; v_available_count integer; v_lines jsonb; v_end timestamptz; v_hold public.booking_holds%rowtype;
begin
  if p_client_access_token_hash is null or length(p_client_access_token_hash)<>64 then raise exception 'Invalid booking access token' using errcode='P0002'; end if;
  select id into v_org from public.organizations where slug=p_slug and active;
  if v_org is null or not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org and active) or not exists(select 1 from public.professional_branches where organization_id=v_org and branch_id=p_branch_id and professional_id=p_professional_id and active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 or jsonb_array_length(p_services)>8 then raise exception 'Invalid services' using errcode='P0002'; end if;
  select count(*) into v_expected_count from jsonb_to_recordset(p_services) input(service_id text);
  select count(*),coalesce(sum(offer.duration_minutes),0),coalesce(sum(offer.price),0),coalesce(jsonb_agg(jsonb_build_object('service_id',input.service_id,'price',offer.price,'duration_minutes',offer.duration_minutes)),'[]'::jsonb) into v_available_count,v_duration,v_total,v_lines from jsonb_to_recordset(p_services) input(service_id text) cross join lateral public.resolve_service_offer_internal(v_org,p_branch_id,p_professional_id,input.service_id) offer where offer.available;
  if v_available_count <> v_expected_count or v_duration <= 0 then raise exception 'Service unavailable' using errcode='P0002'; end if;
  v_end:=p_start_at+v_duration*interval '1 minute'; perform public.ensure_professional_availability(p_professional_id,p_branch_id,p_start_at,v_duration);
  if exists(select 1 from public.appointments where organization_id=v_org and professional_id=p_professional_id and branch_id=p_branch_id and status in ('scheduled','confirmed') and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) or exists(select 1 from public.booking_holds where organization_id=v_org and professional_id=p_professional_id and branch_id=p_branch_id and status='pending_payment' and expires_at>now() and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) then raise exception 'Time unavailable' using errcode='23P01'; end if;
  insert into public.booking_holds(organization_id,branch_id,professional_id,client_name,client_phone,client_email,start_at,ends_at,services,total,deposit_amount,expires_at,client_access_token_hash) values(v_org,p_branch_id,p_professional_id,trim(p_client_name),trim(p_client_phone),nullif(trim(p_client_email),''),p_start_at,v_end,v_lines,v_total,v_total*0.5,now()+interval '15 minutes',p_client_access_token_hash) returning * into v_hold;
  return jsonb_build_object('holdId',v_hold.id,'depositAmount',v_hold.deposit_amount,'expiresAt',v_hold.expires_at);
end $$;

create or replace function public.client_booking_action(p_slug text,p_hold_id uuid,p_token text,p_action text,p_start_at timestamptz default null,p_reason text default '')
returns jsonb language plpgsql security definer set search_path=public as $$
declare h public.booking_holds%rowtype; a public.appointments%rowtype; v_deposit numeric:=0; v_refund numeric:=0; v_policy text; v_refund_status public.cancellation_refund_status;
begin
  select hold.* into h from public.booking_holds hold join public.organizations organization on organization.id=hold.organization_id where hold.id=p_hold_id and organization.slug=p_slug and hold.client_access_token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or h.status<>'converted' or h.appointment_id is null then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into a from public.appointments where id=h.appointment_id and organization_id=h.organization_id for update;
  if not found or a.status not in ('scheduled','confirmed') then raise exception 'Booking cannot be changed' using errcode='P0002'; end if;
  if a.start_at-now()<interval '4 hours' then raise exception 'Policy does not allow changes less than 4 hours before the appointment' using errcode='P0002'; end if;
  if p_action='reschedule' then
    if p_start_at is null then raise exception 'New time is required' using errcode='P0002'; end if;
    perform public.ensure_professional_availability(a.professional_id,a.branch_id,p_start_at,a.total_duration_minutes);
    update public.appointments set start_at=p_start_at where id=a.id;
    insert into public.audit_logs(organization_id,branch_id,actor_email,action,entity_type,entity_id,details) values(a.organization_id,a.branch_id,'public-booking','appointment_rescheduled_by_client','appointment',a.id,jsonb_build_object('previousStartAt',a.start_at,'startAt',p_start_at));
    return jsonb_build_object('status','rescheduled');
  elsif p_action='cancel' then
    select coalesce(sum(amount),0) into v_deposit from public.payments where sale_id=a.sale_id;
    v_refund:=v_deposit; v_policy:='client_more_than_4h'; v_refund_status:=case when v_refund>0 then 'pending' else 'not_required' end;
    update public.appointments set status='cancelled' where id=a.id;
    insert into public.appointment_cancellations(organization_id,branch_id,appointment_id,cancelled_by,reason,policy_applied,refund_amount,refund_status) values(a.organization_id,a.branch_id,a.id,'client',left(coalesce(p_reason,''),500),v_policy,v_refund,v_refund_status) on conflict(appointment_id) do update set reason=excluded.reason,refund_amount=excluded.refund_amount,refund_status=excluded.refund_status,cancelled_at=now();
    insert into public.audit_logs(organization_id,branch_id,actor_email,action,entity_type,entity_id,details) values(a.organization_id,a.branch_id,'public-booking','appointment_cancelled_by_client','appointment',a.id,jsonb_build_object('policy',v_policy,'refundAmount',v_refund,'refundStatus',v_refund_status));
    return jsonb_build_object('status','cancelled','refundAmount',v_refund,'refundStatus',v_refund_status);
  end if;
  raise exception 'Invalid booking action' using errcode='P0002';
exception when exclusion_violation then raise exception 'Time unavailable' using errcode='P0002';
end $$;
revoke all on function public.client_booking_action(text,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.client_booking_action(text,uuid,text,text,timestamptz,text) to anon,authenticated;