alter type public.message_delivery_status add value if not exists 'processing';

create or replace function public.claim_due_message_deliveries(p_limit integer default 50)
returns table (id uuid, recipient text, body text, template_code text)
language plpgsql security definer set search_path = public as $$
begin
  -- Recover deliveries left by an interrupted worker before claiming new work.
  update public.message_deliveries
    set status = 'queued', error_message = 'Delivery claim timed out'
    where status = 'processing' and sent_at is null and created_at < now() - interval '15 minutes';

  return query
  with due as (
    select delivery.id
    from public.message_deliveries delivery
    join public.clients client on client.id = delivery.client_id
    where delivery.status = 'queued'
      and delivery.scheduled_at <= now()
      and client.whatsapp_opt_out_at is null
    order by delivery.scheduled_at
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    for update of delivery skip locked
  ), claimed as (
    update public.message_deliveries delivery
    set status = 'processing', error_message = null
    from due
    where delivery.id = due.id
    returning delivery.id, delivery.recipient, delivery.body, delivery.template_code
  )
  select claimed.id, claimed.recipient, claimed.body, claimed.template_code from claimed;
end $$;

revoke all on function public.claim_due_message_deliveries(integer) from public, anon, authenticated;
