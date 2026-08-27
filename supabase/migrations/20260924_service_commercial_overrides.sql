-- Service availability and commercial overrides by branch and professional.
create table if not exists public.service_branch_pricing (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  price numeric(12,2) not null check(price >= 0),
  duration_minutes integer not null check(duration_minutes >= 5),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(branch_id, service_id)
);
create table if not exists public.professional_service_overrides (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  professional_id text not null references public.professionals(id) on delete cascade,
  service_id text not null references public.services(id) on delete cascade,
  price numeric(12,2) check(price >= 0),
  duration_minutes integer check(duration_minutes >= 5),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key(branch_id, professional_id, service_id)
);
create or replace function public.assert_service_offer_tenant()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.branches where id=new.branch_id and organization_id=new.organization_id)
    or not exists(select 1 from public.services where id=new.service_id and organization_id=new.organization_id) then
    raise exception 'Invalid tenant service reference' using errcode='23514';
  end if;
  if tg_table_name='professional_service_overrides' and not exists(select 1 from public.professionals where id=new.professional_id and organization_id=new.organization_id) then
    raise exception 'Invalid tenant professional reference' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists service_branch_pricing_tenant_integrity on public.service_branch_pricing;
create trigger service_branch_pricing_tenant_integrity before insert or update on public.service_branch_pricing for each row execute function public.assert_service_offer_tenant();
drop trigger if exists professional_service_override_tenant_integrity on public.professional_service_overrides;
create trigger professional_service_override_tenant_integrity before insert or update on public.professional_service_overrides for each row execute function public.assert_service_offer_tenant();
revoke all on function public.assert_service_offer_tenant() from public,anon,authenticated;
alter table public.service_branch_pricing enable row level security;
alter table public.professional_service_overrides enable row level security;
create policy service_branch_pricing_tenant_read on public.service_branch_pricing for select to authenticated using(organization_id=public.current_organization_id());
create policy service_branch_pricing_admin_write on public.service_branch_pricing for all to authenticated using(organization_id=public.current_organization_id() and public.is_admin()) with check(organization_id=public.current_organization_id() and public.is_admin());
create policy professional_service_overrides_tenant_read on public.professional_service_overrides for select to authenticated using(organization_id=public.current_organization_id());
create policy professional_service_overrides_admin_write on public.professional_service_overrides for all to authenticated using(organization_id=public.current_organization_id() and public.is_admin()) with check(organization_id=public.current_organization_id() and public.is_admin());
grant select,insert,update,delete on public.service_branch_pricing,public.professional_service_overrides to authenticated;
create index if not exists professional_service_overrides_lookup_idx on public.professional_service_overrides(organization_id,branch_id,professional_id,service_id) where active;

-- Internal helper. No caller role is granted direct execution.
create or replace function public.resolve_service_offer_internal(p_organization_id uuid,p_branch_id uuid,p_professional_id text,p_service_id text)
returns table(price numeric,duration_minutes integer,available boolean)
language sql stable security definer set search_path=public as $$
  select coalesce(professional_override.price,branch_price.price,service.base_price), coalesce(professional_override.duration_minutes,branch_price.duration_minutes,service.duration_minutes), service.active and coalesce(branch_price.active,true) and coalesce(professional_override.active,true)
  from public.services service
  left join public.service_branch_pricing branch_price on branch_price.organization_id=service.organization_id and branch_price.branch_id=p_branch_id and branch_price.service_id=service.id
  left join public.professional_service_overrides professional_override on professional_override.organization_id=service.organization_id and professional_override.branch_id=p_branch_id and professional_override.professional_id=p_professional_id and professional_override.service_id=service.id
  where service.organization_id=p_organization_id and service.id=p_service_id
$$;
revoke all on function public.resolve_service_offer_internal(uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.create_public_booking_hold(p_slug text, p_branch_id uuid, p_professional_id text, p_start_at timestamptz, p_services jsonb, p_client_name text, p_client_phone text, p_client_email text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_duration integer; v_total numeric; v_expected_count integer; v_available_count integer; v_end timestamptz; v_hold public.booking_holds%rowtype;
begin
  select id into v_org from public.organizations where slug=p_slug and active;
  if v_org is null or not exists(select 1 from public.branches where id=p_branch_id and organization_id=v_org and active) or not exists(select 1 from public.professional_branches where organization_id=v_org and branch_id=p_branch_id and professional_id=p_professional_id and active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services)=0 or jsonb_array_length(p_services)>8 then raise exception 'Invalid services' using errcode='P0002'; end if;
  select count(*) into v_expected_count from jsonb_to_recordset(p_services) input(service_id text);
  select count(*),coalesce(sum(offer.duration_minutes),0),coalesce(sum(offer.price),0) into v_available_count,v_duration,v_total from jsonb_to_recordset(p_services) input(service_id text) cross join lateral public.resolve_service_offer_internal(v_org,p_branch_id,p_professional_id,input.service_id) offer where offer.available;
  if v_available_count <> v_expected_count or v_duration <= 0 then raise exception 'Service unavailable' using errcode='P0002'; end if;
  v_end:=p_start_at + v_duration * interval '1 minute';
  perform public.ensure_professional_availability(p_professional_id,p_branch_id,p_start_at,v_duration);
  if exists(select 1 from public.appointments where organization_id=v_org and professional_id=p_professional_id and branch_id=p_branch_id and status in ('scheduled','confirmed') and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) or exists(select 1 from public.booking_holds where organization_id=v_org and professional_id=p_professional_id and branch_id=p_branch_id and status='pending_payment' and expires_at>now() and tstzrange(start_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) then raise exception 'Time unavailable' using errcode='23P01'; end if;
  insert into public.booking_holds(organization_id,branch_id,professional_id,client_name,client_phone,client_email,start_at,ends_at,services,total,deposit_amount,expires_at) values(v_org,p_branch_id,p_professional_id,trim(p_client_name),trim(p_client_phone),nullif(trim(p_client_email),''),p_start_at,v_end,p_services,v_total,v_total*0.5,now()+interval '15 minutes') returning * into v_hold;
  return jsonb_build_object('holdId',v_hold.id,'depositAmount',v_hold.deposit_amount,'expiresAt',v_hold.expires_at);
end $$;
revoke all on function public.create_public_booking_hold(text,uuid,text,timestamptz,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.create_public_booking_hold(text,uuid,text,timestamptz,jsonb,text,text,text) to anon,authenticated;