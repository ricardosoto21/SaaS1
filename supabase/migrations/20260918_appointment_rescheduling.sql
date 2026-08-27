create or replace function public.tenant_reschedule_appointment_transaction(p_appointment_id text,p_organization_id uuid,p_start_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare v_appointment public.appointments%rowtype;
begin
  select * into v_appointment from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Resource not found' using errcode='P0002'; end if;
  perform public.assert_tenant_access(p_organization_id,v_appointment.branch_id);
  if v_appointment.status not in ('scheduled','confirmed') then raise exception 'Appointment cannot be rescheduled' using errcode='P0002'; end if;
  perform public.ensure_professional_availability(v_appointment.professional_id,v_appointment.branch_id,p_start_at,v_appointment.total_duration_minutes);
  update public.appointments set start_at=p_start_at where id=v_appointment.id;
  insert into public.audit_logs(organization_id,branch_id,actor_id,action,entity_type,entity_id,details) values(p_organization_id,v_appointment.branch_id,auth.uid(),'appointment_rescheduled','appointment',v_appointment.id,jsonb_build_object('previousStartAt',v_appointment.start_at,'startAt',p_start_at));
exception when exclusion_violation then raise exception 'Ese horario ya esta ocupado por una cita agendada o confirmada.' using errcode='P0002';
end $$;
revoke all on function public.tenant_reschedule_appointment_transaction(text,uuid,timestamptz) from public,anon;
grant execute on function public.tenant_reschedule_appointment_transaction(text,uuid,timestamptz) to authenticated;