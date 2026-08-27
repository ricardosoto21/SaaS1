create type public.booking_hold_status as enum ('pending_payment','expired','converted','cancelled');

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  professional_id text not null references public.professionals(id),
  client_name text not null,
  client_phone text not null,
  client_email text,
  start_at timestamptz not null,
  ends_at timestamptz not null,
  services jsonb not null,
  total numeric(12,2) not null check (total > 0),
  deposit_amount numeric(12,2) not null check (deposit_amount = total * 0.5),
  status public.booking_hold_status not null default 'pending_payment',
  expires_at timestamptz not null,
  appointment_id text references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > start_at)
);
create index if not exists booking_holds_availability_idx on public.booking_holds(professional_id,start_at,ends_at) where status='pending_payment';
alter table public.booking_holds enable row level security;

create or replace function public.create_public_booking_hold(p_slug text, p_branch_id uuid, p_professional_id text, p_start_at timestamptz, p_services jsonb, p_client_name text, p_client_phone text, p_client_email text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_duration integer; v_total numeric(12,2); v_end timestamptz; v_hold public.booking_holds%rowtype;
begin
  select id into v_org from public.organizations where slug=p_slug and active;
  if v_org is null or not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org and active) or not exists(select 1 from public.professionals p join public.professional_branches pb on pb.professional_id=p.id where p.id=p_professional_id and p.organization_id=v_org and pb.branch_id=p_branch_id and pb.active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if length(trim(coalesce(p_client_name,''))) < 2 or length(trim(coalesce(p_client_phone,''))) < 6 or jsonb_array_length(coalesce(p_services,'[]'::jsonb))=0 then raise exception 'Datos de reserva invalidos' using errcode='P0002'; end if;
  select coalesce(sum(s.duration_minutes),0),coalesce(sum(s.base_price),0) into v_duration,v_total from jsonb_to_recordset(p_services) as x(service_id text) join public.services s on s.id=x.service_id and s.organization_id=v_org and s.active;
  if v_duration<=0 or v_total<=0 or (select count(*) from jsonb_to_recordset(p_services) as x(service_id text)) <> (select count(*) from jsonb_to_recordset(p_services) as x(service_id text) join public.services s on s.id=x.service_id and s.organization_id=v_org and s.active) then raise exception 'Servicios invalidos' using errcode='P0002'; end if;
  v_end:=p_start_at+v_duration*interval '1 minute';
  perform public.ensure_professional_availability(p_professional_id,p_branch_id,p_start_at,v_duration);
  if exists(select 1 from public.appointments where professional_id=p_professional_id and status in ('scheduled','confirmed') and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) or exists(select 1 from public.booking_holds where professional_id=p_professional_id and status='pending_payment' and expires_at>now() and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) then raise exception 'Horario no disponible' using errcode='P0002'; end if;
  insert into public.booking_holds(organization_id,branch_id,professional_id,client_name,client_phone,client_email,start_at,ends_at,services,total,deposit_amount,expires_at) values(v_org,p_branch_id,p_professional_id,trim(p_client_name),trim(p_client_phone),nullif(trim(p_client_email),''),p_start_at,v_end,p_services,v_total,v_total*0.5,now()+interval '15 minutes') returning * into v_hold;
  return jsonb_build_object('holdId',v_hold.id,'depositAmount',v_hold.deposit_amount,'expiresAt',v_hold.expires_at);
end;
$$;
revoke all on function public.create_public_booking_hold(text,uuid,text,timestamptz,jsonb,text,text,text) from public;
grant execute on function public.create_public_booking_hold(text,uuid,text,timestamptz,jsonb,text,text,text) to anon,authenticated;
