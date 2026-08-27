-- Adds subscription enforcement to the existing idempotent maintenance job.
create or replace function public.run_booking_and_messaging_maintenance()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_expired integer; v_queued integer; v_suspended integer;
begin
  update public.booking_holds set status='expired' where status='pending_payment' and expires_at<=now();
  get diagnostics v_expired = row_count;
  insert into public.message_deliveries(organization_id,branch_id,appointment_id,client_id,template_code,recipient,body,scheduled_at)
  select appointment.organization_id,appointment.branch_id,appointment.id,client.id,'booking_confirmation',client.phone,replace(replace(template.body,'{{clientName}}',client.full_name),'{{appointmentAt}}',to_char(appointment.start_at at time zone 'America/Santiago','DD/MM HH24:MI')),now()
  from public.appointments appointment join public.clients client on client.id=appointment.client_id join public.message_templates template on template.organization_id=appointment.organization_id and template.code='booking_confirmation' and template.active
  where appointment.status='confirmed' and client.whatsapp_opt_out_at is null and appointment.created_at>=now()-interval '24 hours'
  on conflict(appointment_id,template_code) do nothing;
  get diagnostics v_queued = row_count;
  insert into public.message_deliveries(organization_id,branch_id,appointment_id,client_id,template_code,recipient,body,scheduled_at)
  select appointment.organization_id,appointment.branch_id,appointment.id,client.id,'reminder_24h',client.phone,replace(replace(template.body,'{{clientName}}',client.full_name),'{{appointmentAt}}',to_char(appointment.start_at at time zone 'America/Santiago','DD/MM HH24:MI')),now()
  from public.appointments appointment join public.clients client on client.id=appointment.client_id join public.message_templates template on template.organization_id=appointment.organization_id and template.code='reminder_24h' and template.active
  where appointment.status in ('scheduled','confirmed') and client.whatsapp_opt_out_at is null and appointment.start_at between now()+interval '23 hours' and now()+interval '25 hours'
  on conflict(appointment_id,template_code) do nothing;
  insert into public.message_deliveries(organization_id,branch_id,appointment_id,client_id,template_code,recipient,body,scheduled_at)
  select appointment.organization_id,appointment.branch_id,appointment.id,client.id,'reminder_2h',client.phone,replace(replace(template.body,'{{clientName}}',client.full_name),'{{appointmentAt}}',to_char(appointment.start_at at time zone 'America/Santiago','DD/MM HH24:MI')),now()
  from public.appointments appointment join public.clients client on client.id=appointment.client_id join public.message_templates template on template.organization_id=appointment.organization_id and template.code='reminder_2h' and template.active
  where appointment.status in ('scheduled','confirmed') and client.whatsapp_opt_out_at is null and appointment.start_at between now()+interval '105 minutes' and now()+interval '135 minutes'
  on conflict(appointment_id,template_code) do nothing;
  select public.expire_subscription_grace_periods() into v_suspended;
  return jsonb_build_object('expiredHolds',v_expired,'queuedMessages',v_queued,'suspendedSubscriptions',v_suspended);
end $$;
revoke all on function public.run_booking_and_messaging_maintenance() from public,anon,authenticated;