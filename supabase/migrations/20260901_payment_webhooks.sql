create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  payload_hash text not null,
  payload jsonb not null,
  processing_status text not null default 'received',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider, external_event_id)
);
alter table public.payment_webhook_events enable row level security;

create or replace function public.confirm_public_booking_hold(p_hold_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare h public.booking_holds%rowtype; v_client_id text; v_appointment_id text := 'appointment-' || gen_random_uuid()::text; v_line record;
begin
  select * into h from public.booking_holds where id=p_hold_id for update;
  if not found then raise exception 'Resource not found' using errcode='P0002'; end if;
  if h.status='converted' then return h.appointment_id; end if;
  if h.status<>'pending_payment' or h.expires_at<=now() then raise exception 'Hold expired' using errcode='P0002'; end if;
  insert into public.clients(id,organization_id,full_name,phone,email,preferences,notes) values('client-'||gen_random_uuid()::text,h.organization_id,h.client_name,h.client_phone,h.client_email,'','Reserva online') returning id into v_client_id;
  insert into public.appointments(id,organization_id,branch_id,client_id,professional_id,start_at,ends_at,status,notes,estimated_total,total_duration_minutes) values(v_appointment_id,h.organization_id,h.branch_id,v_client_id,h.professional_id,h.start_at,h.ends_at,'confirmed','Reserva online con anticipo',h.total,extract(epoch from h.ends_at-h.start_at)/60);
  for v_line in select s.id,s.base_price,s.duration_minutes from jsonb_to_recordset(h.services) x(service_id text) join public.services s on s.id=x.service_id loop insert into public.appointment_services(id,organization_id,branch_id,appointment_id,service_id,price,duration_minutes,notes) values('appointment-service-'||gen_random_uuid()::text,h.organization_id,h.branch_id,v_appointment_id,v_line.id,v_line.base_price,v_line.duration_minutes,'Reserva online'); end loop;
  update public.booking_holds set status='converted',appointment_id=v_appointment_id where id=h.id;
  return v_appointment_id;
end;
$$;
revoke all on function public.confirm_public_booking_hold(uuid) from public,anon,authenticated;
