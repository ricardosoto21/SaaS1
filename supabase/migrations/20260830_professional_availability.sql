create extension if not exists btree_gist;

create table if not exists public.professional_working_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  professional_id text not null references public.professionals(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  check (ends_at > starts_at),
  unique (branch_id, professional_id, weekday, starts_at, ends_at)
);

create table if not exists public.professional_time_off (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  professional_id text not null references public.professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.professional_working_hours enable row level security;
alter table public.professional_time_off enable row level security;
create policy professional_working_hours_read on public.professional_working_hours for select to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id));
create policy professional_working_hours_admin on public.professional_working_hours for all to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin()) with check (organization_id=public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin());
create policy professional_time_off_read on public.professional_time_off for select to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id));
create policy professional_time_off_admin on public.professional_time_off for all to authenticated using (organization_id=public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin()) with check (organization_id=public.current_organization_id() and public.has_branch_access(branch_id) and public.is_admin());
grant select, insert, update, delete on public.professional_working_hours, public.professional_time_off to authenticated;

alter table public.appointments add column if not exists ends_at timestamptz;
update public.appointments set ends_at = start_at + total_duration_minutes * interval '1 minute' where ends_at is null;
alter table public.appointments alter column ends_at set not null;
create or replace function public.set_appointment_end_at()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.ends_at := new.start_at + new.total_duration_minutes * interval '1 minute';
  return new;
end;
$$;
drop trigger if exists appointments_set_end_at on public.appointments;
create trigger appointments_set_end_at before insert or update of start_at,total_duration_minutes on public.appointments for each row execute function public.set_appointment_end_at();
alter table public.appointments drop constraint if exists appointments_professional_no_overlap;
alter table public.appointments add constraint appointments_professional_no_overlap exclude using gist (
  professional_id with =,
  tstzrange(start_at, ends_at, '[)') with &&
) where (status in ('scheduled', 'confirmed'));

create or replace function public.ensure_professional_availability(p_professional_id text, p_branch_id uuid, p_start_at timestamptz, p_duration integer)
returns void language plpgsql security definer set search_path=public as $$
declare v_end timestamptz := p_start_at + p_duration * interval '1 minute';
begin
  if exists (select 1 from public.professional_time_off where professional_id=p_professional_id and branch_id=p_branch_id and tstzrange(starts_at,ends_at,'[)') && tstzrange(p_start_at,v_end,'[)')) then
    raise exception 'El profesional no esta disponible en ese horario.' using errcode='P0002';
  end if;
  if exists (select 1 from public.professional_working_hours where professional_id=p_professional_id and branch_id=p_branch_id and active)
    and not exists (select 1 from public.professional_working_hours where professional_id=p_professional_id and branch_id=p_branch_id and active and weekday=extract(dow from p_start_at at time zone 'America/Santiago') and starts_at <= (p_start_at at time zone 'America/Santiago')::time and ends_at >= (v_end at time zone 'America/Santiago')::time) then
    raise exception 'El horario esta fuera de la jornada del profesional.' using errcode='P0002';
  end if;
end;
$$;

create or replace function public.tenant_create_appointment_transaction(payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := (payload->>'organizationId')::uuid; v_branch uuid := (payload->>'branchId')::uuid; v_duration integer;
begin
  perform public.assert_tenant_access(v_org,v_branch);
  if not exists (select 1 from public.clients where id=payload->>'clientId' and organization_id=v_org) or not exists (select 1 from public.professionals p join public.professional_branches pb on pb.professional_id=p.id where p.id=payload->>'professionalId' and p.organization_id=v_org and pb.branch_id=v_branch and pb.active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  select coalesce(sum(("durationMinutes")::integer),0) into v_duration from jsonb_to_recordset(coalesce(payload->'services','[]'::jsonb)) as x("durationMinutes" integer);
  perform public.ensure_professional_availability(payload->>'professionalId',v_branch,(payload->>'startAt')::timestamptz,v_duration);
  perform set_config('app.organization_id',v_org::text,true); perform set_config('app.branch_id',v_branch::text,true);
  perform public.create_appointment_transaction(payload-'organizationId'-'branchId');
exception when exclusion_violation then raise exception 'Ese horario ya esta ocupado por una cita agendada o confirmada.' using errcode='P0002';
end;
$$;
grant execute on function public.ensure_professional_availability(text,uuid,timestamptz,integer) to authenticated;
grant execute on function public.tenant_create_appointment_transaction(jsonb) to authenticated;
