-- Fase 5: bind every booking payment to its salon and persist the deposit atomically.

alter table public.booking_payment_attempts
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.booking_payment_attempts attempt
set organization_id = hold.organization_id
from public.booking_holds hold
where hold.id = attempt.hold_id and attempt.organization_id is null;

alter table public.booking_payment_attempts
  alter column organization_id set not null;

create index if not exists booking_payment_attempts_org_status_idx
  on public.booking_payment_attempts(organization_id, status);

create or replace function public.confirm_public_booking_payment(
  p_hold_id uuid,
  p_provider text,
  p_checkout_id text,
  p_paid_amount numeric
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.booking_holds%rowtype;
  v_client_id text;
  v_appointment_id text;
  v_sale_id text;
  v_line record;
begin
  select * into h from public.booking_holds where id = p_hold_id for update;
  if not found then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;

  if h.status = 'converted' then
    return h.appointment_id;
  end if;

  if h.status <> 'pending_payment' or h.expires_at <= now() then
    raise exception 'Hold expired' using errcode = 'P0002';
  end if;

  if p_provider <> 'sumup' or p_checkout_id = '' or p_paid_amount <> h.deposit_amount then
    raise exception 'Payment verification failed' using errcode = 'P0002';
  end if;

  select id into v_client_id
  from public.clients
  where organization_id = h.organization_id
    and phone = h.client_phone
  order by created_at asc
  limit 1;

  if v_client_id is null then
    v_client_id := 'client-' || gen_random_uuid()::text;
    insert into public.clients(id, organization_id, full_name, phone, email, preferences, notes)
    values (v_client_id, h.organization_id, h.client_name, h.client_phone, h.client_email, '', 'Reserva online');
  end if;

  v_appointment_id := 'appointment-' || gen_random_uuid()::text;
  v_sale_id := 'sale-' || gen_random_uuid()::text;

  insert into public.appointments(
    id, organization_id, branch_id, client_id, professional_id, start_at, ends_at,
    status, notes, estimated_total, total_duration_minutes, sale_id
  ) values (
    v_appointment_id, h.organization_id, h.branch_id, v_client_id, h.professional_id,
    h.start_at, h.ends_at, 'confirmed', 'Reserva online con anticipo', h.total,
    extract(epoch from h.ends_at - h.start_at) / 60, v_sale_id
  );

  insert into public.sales(
    id, organization_id, branch_id, client_id, professional_id, appointment_id,
    origin, sold_at, notes, total, amount_paid, amount_due, payment_status
  ) values (
    v_sale_id, h.organization_id, h.branch_id, v_client_id, h.professional_id,
    v_appointment_id, 'appointment', now(), 'Anticipo de reserva online', h.total,
    h.deposit_amount, h.total - h.deposit_amount, 'partial'
  );

  for v_line in
    select service.id, service.name, category.name as category_name, service.base_price, service.duration_minutes
    from jsonb_to_recordset(h.services) input(service_id text)
    join public.services service on service.id = input.service_id and service.organization_id = h.organization_id
    join public.service_categories category on category.id = service.category_id
  loop
    insert into public.appointment_services(
      id, organization_id, branch_id, appointment_id, service_id, price, duration_minutes, notes
    ) values (
      'appointment-service-' || gen_random_uuid()::text, h.organization_id, h.branch_id,
      v_appointment_id, v_line.id, v_line.base_price, v_line.duration_minutes, 'Reserva online'
    );
    insert into public.sale_items(
      id, organization_id, branch_id, sale_id, item_type, service_id, item_name,
      category_name, quantity, unit_price, total
    ) values (
      'sale-item-' || gen_random_uuid()::text, h.organization_id, h.branch_id,
      v_sale_id, 'service', v_line.id, v_line.name, v_line.category_name,
      1, v_line.base_price, v_line.base_price
    );
  end loop;

  insert into public.payments(
    id, organization_id, branch_id, sale_id, amount, method, paid_at, note
  ) values (
    'payment-' || gen_random_uuid()::text, h.organization_id, h.branch_id,
    v_sale_id, h.deposit_amount, 'online', now(), 'Anticipo SumUp: ' || left(p_checkout_id, 120)
  );

  update public.booking_holds
  set status = 'converted', appointment_id = v_appointment_id
  where id = h.id;

  insert into public.audit_logs(organization_id, branch_id, actor_email, action, entity_type, entity_id, details)
  values (h.organization_id, h.branch_id, 'payment-webhook', 'booking_payment_confirmed', 'appointment', v_appointment_id,
    jsonb_build_object('provider', p_provider, 'checkoutId', p_checkout_id, 'deposit', h.deposit_amount));

  return v_appointment_id;
end;
$$;

revoke all on function public.confirm_public_booking_payment(uuid, text, text, numeric) from public, anon, authenticated;