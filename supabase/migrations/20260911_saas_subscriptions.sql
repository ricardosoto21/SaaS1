create type public.subscription_status as enum ('trialing','active','past_due','suspended','cancelled');

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  monthly_price numeric(12,2) not null check(monthly_price >= 0),
  currency text not null default 'CLP',
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status public.subscription_status not null default 'trialing',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  grace_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  provider text,
  external_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.organization_subscriptions(id) on delete cascade,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;
alter table public.organization_subscriptions enable row level security;
alter table public.subscription_events enable row level security;
create policy subscription_plans_platform_read on public.subscription_plans for select to authenticated using(public.is_platform_admin());
create policy subscription_plans_platform_write on public.subscription_plans for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy organization_subscriptions_platform on public.organization_subscriptions for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy organization_subscriptions_tenant_read on public.organization_subscriptions for select to authenticated using(organization_id=public.current_organization_id() and public.is_admin());
create policy subscription_events_platform on public.subscription_events for select to authenticated using(public.is_platform_admin());
create policy subscription_events_tenant_read on public.subscription_events for select to authenticated using(organization_id=public.current_organization_id() and public.is_admin());
grant select,insert,update,delete on public.subscription_plans,public.organization_subscriptions,public.subscription_events to authenticated;

insert into public.subscription_plans(code,name,monthly_price,limits,features) values
('starter','Starter',19990,'{"branches":1,"users":3}'::jsonb,'{"publicBooking":true,"whatsapp":false,"commissions":false}'::jsonb),
('pro','Pro',39990,'{"branches":3,"users":10}'::jsonb,'{"publicBooking":true,"whatsapp":true,"commissions":true}'::jsonb),
('business','Business',69990,'{"branches":10,"users":50}'::jsonb,'{"publicBooking":true,"whatsapp":true,"commissions":true}'::jsonb)
on conflict(code) do nothing;

create or replace function public.organization_subscription_is_active(p_organization_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_subscriptions where organization_id=p_organization_id and (status in ('trialing','active') or (status='past_due' and grace_period_end>now())) and current_period_end>now()-interval '1 day')
$$;
revoke all on function public.organization_subscription_is_active(uuid) from public,anon;
grant execute on function public.organization_subscription_is_active(uuid) to authenticated;