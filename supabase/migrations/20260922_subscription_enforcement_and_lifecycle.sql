-- Subscription lifecycle, server-side access state and plan entitlements.
alter type public.subscription_status add value if not exists 'pending';

alter table public.organization_subscriptions
  add column if not exists cancelled_at timestamptz,
  add column if not exists scheduled_for_deletion_at timestamptz,
  add column if not exists blocked_at timestamptz;

update public.subscription_plans
set name = 'Basico', monthly_price = 50000,
    limits = '{"branches":1,"users":null}'::jsonb,
    features = '{"publicBooking":true,"whatsapp":false,"commissions":true}'::jsonb
where code = 'starter';

update public.subscription_plans
set limits = '{"branches":null,"users":null}'::jsonb,
    features = '{"publicBooking":true,"whatsapp":true,"commissions":true}'::jsonb
where code in ('pro','business');

create or replace function public.subscription_access_state(p_organization_id uuid)
returns table (
  status public.subscription_status,
  current_period_end timestamptz,
  grace_period_end timestamptz,
  scheduled_for_deletion_at timestamptz,
  allowed boolean,
  limits jsonb,
  features jsonb
)
language sql stable security definer set search_path=public as $$
  select
    subscription.status,
    subscription.current_period_end,
    subscription.grace_period_end,
    subscription.scheduled_for_deletion_at,
    (
      subscription.status in ('active','trialing') and subscription.current_period_end > now()
    ) or (
      subscription.status = 'past_due' and subscription.grace_period_end > now()
    ) as allowed,
    plan.limits,
    plan.features
  from public.organization_subscriptions subscription
  join public.subscription_plans plan on plan.id = subscription.plan_id
  where subscription.organization_id = p_organization_id
    and (p_organization_id = public.current_organization_id() or public.is_platform_admin())
$$;

create or replace function public.organization_subscription_is_active(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select allowed from public.subscription_access_state(p_organization_id)), false)
$$;

create or replace function public.tenant_create_branch(
  p_name text,
  p_timezone text default 'America/Santiago'
)
returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_organization_id uuid := public.current_organization_id();
  v_limit integer;
  v_count integer;
  v_branch_id uuid;
begin
  if auth.uid() is null or not public.is_admin() or v_organization_id is null then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if not public.organization_subscription_is_active(v_organization_id) then
    raise exception 'Subscription access is inactive' using errcode='42501';
  end if;
  select nullif((limits->>'branches'),'')::integer into v_limit from public.subscription_access_state(v_organization_id);
  select count(*) into v_count from public.branches where organization_id=v_organization_id and active;
  if v_limit is not null and v_count >= v_limit then
    raise exception 'Branch limit reached for this plan' using errcode='P0002';
  end if;
  if length(trim(p_name)) < 2 then raise exception 'Invalid branch name' using errcode='P0002'; end if;
  insert into public.branches(organization_id,name,timezone) values(v_organization_id,trim(p_name),coalesce(nullif(trim(p_timezone),''),'America/Santiago')) returning id into v_branch_id;
  insert into public.user_branch_access(organization_id,branch_id,user_id,active) values(v_organization_id,v_branch_id,auth.uid(),true);
  insert into public.audit_logs(organization_id,branch_id,actor_id,action,entity_type,entity_id,details)
  values(v_organization_id,v_branch_id,auth.uid(),'create','branch',v_branch_id::text,jsonb_build_object('name',trim(p_name)));
  return v_branch_id;
end;
$$;

create or replace function public.tenant_cancel_subscription(p_reason text default '')
returns void
language plpgsql security definer set search_path=public as $$
declare v_organization_id uuid := public.current_organization_id();
begin
  if auth.uid() is null or not public.is_admin() or v_organization_id is null then raise exception 'Access denied' using errcode='42501'; end if;
  update public.organization_subscriptions
  set cancel_at_period_end=true, cancelled_at=now(), scheduled_for_deletion_at=greatest(current_period_end,now()) + interval '30 days', updated_at=now()
  where organization_id=v_organization_id;
  insert into public.subscription_events(organization_id,subscription_id,action,details,actor_id)
  select v_organization_id,id,'cancellation_requested',jsonb_build_object('reason',left(coalesce(p_reason,''),500)),auth.uid()
  from public.organization_subscriptions where organization_id=v_organization_id;
end;
$$;

create or replace function public.expire_subscription_grace_periods()
returns integer
language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  update public.organization_subscriptions
  set status='suspended', blocked_at=now(), updated_at=now()
  where status='past_due' and grace_period_end is not null and grace_period_end <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.subscription_access_state(uuid), public.organization_subscription_is_active(uuid), public.tenant_create_branch(text,text), public.tenant_cancel_subscription(text), public.expire_subscription_grace_periods() from public, anon;
grant execute on function public.subscription_access_state(uuid), public.organization_subscription_is_active(uuid), public.tenant_create_branch(text,text), public.tenant_cancel_subscription(text) to authenticated;