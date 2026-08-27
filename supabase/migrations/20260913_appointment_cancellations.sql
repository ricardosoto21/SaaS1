create type public.cancellation_refund_status as enum ('not_required','pending','completed','not_eligible');
create table if not exists public.appointment_cancellations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  appointment_id text not null unique references public.appointments(id) on delete cascade,
  cancelled_by text not null check(cancelled_by in ('client','salon','staff')),
  actor_id uuid references auth.users(id) on delete set null,
  reason text not null default '',
  policy_applied text not null,
  refund_amount numeric(12,2) not null default 0,
  refund_status public.cancellation_refund_status not null,
  provider_reference text,
  cancelled_at timestamptz not null default now()
);
alter table public.appointment_cancellations enable row level security;
create policy appointment_cancellations_read on public.appointment_cancellations for select to authenticated using(organization_id=public.current_organization_id() and public.has_branch_access(branch_id));
grant select on public.appointment_cancellations to authenticated;

create or replace function public.tenant_cancel_appointment_transaction(p_appointment_id text,p_organization_id uuid,p_cancelled_by text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare appointment_row public.appointments%rowtype; v_deposit numeric(12,2):=0; v_refund numeric(12,2):=0; v_policy text; v_status public.cancellation_refund_status;
begin
  select * into appointment_row from public.appointments where id=p_appointment_id and organization_id=p_organization_id for update;
  if not found then raise exception 'Resource not found' using errcode='P0002'; end if;
  perform public.assert_tenant_access(p_organization_id,appointment_row.branch_id);
  if p_cancelled_by not in ('client','salon','staff') then raise exception 'Invalid cancellation' using errcode='P0002'; end if;
  if appointment_row.sale_id is not null then select coalesce(sum(amount),0) into v_deposit from public.payments where sale_id=appointment_row.sale_id; end if;
  if p_cancelled_by='salon' then v_refund:=v_deposit; v_policy:='salon_full_refund'; v_status:=case when v_refund>0 then 'pending' else 'not_required' end;
  elsif appointment_row.start_at-now()>=interval '4 hours' then v_refund:=v_deposit; v_policy:='client_more_than_4h'; v_status:=case when v_refund>0 then 'pending' else 'not_required' end;
  else v_policy:='client_less_than_4h'; v_status:=case when v_deposit>0 then 'not_eligible' else 'not_required' end;
  end if;
  update public.appointments set status='cancelled' where id=appointment_row.id;
  insert into public.appointment_cancellations(organization_id,branch_id,appointment_id,cancelled_by,actor_id,reason,policy_applied,refund_amount,refund_status) values(p_organization_id,appointment_row.branch_id,appointment_row.id,p_cancelled_by,auth.uid(),left(coalesce(p_reason,''),500),v_policy,v_refund,v_status) on conflict(appointment_id) do update set cancelled_by=excluded.cancelled_by,actor_id=excluded.actor_id,reason=excluded.reason,policy_applied=excluded.policy_applied,refund_amount=excluded.refund_amount,refund_status=excluded.refund_status,cancelled_at=now();
  insert into public.audit_logs(organization_id,branch_id,actor_id,action,entity_type,entity_id,details) values(p_organization_id,appointment_row.branch_id,auth.uid(),'appointment_cancelled','appointment',appointment_row.id,jsonb_build_object('policy',v_policy,'refundAmount',v_refund,'refundStatus',v_status));
  return jsonb_build_object('refundAmount',v_refund,'refundStatus',v_status,'policy',v_policy);
end $$;
revoke all on function public.tenant_cancel_appointment_transaction(text,uuid,text,text) from public,anon;
grant execute on function public.tenant_cancel_appointment_transaction(text,uuid,text,text) to authenticated;