-- Fase 2: platform administrators and audited support impersonation.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid not null references auth.users(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null
);
create unique index if not exists one_active_impersonation_per_admin on public.impersonation_sessions(platform_admin_id) where ended_at is null;
create index if not exists impersonation_sessions_organization_idx on public.impersonation_sessions(organization_id, started_at desc);

alter table public.platform_admins enable row level security;
alter table public.impersonation_sessions enable row level security;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid() and active)
$$;

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public as $$
  select coalesce(
    (select organization_id from public.profiles where id = auth.uid() and active = true),
    (select organization_id from public.impersonation_sessions where platform_admin_id = auth.uid() and ended_at is null order by started_at desc limit 1)
  )
$$;

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path=public as $$
  select case when public.is_platform_admin() and exists (select 1 from public.impersonation_sessions where platform_admin_id = auth.uid() and ended_at is null) then 'admin'::public.app_role else (select role from public.profiles where id = auth.uid() and active = true) end
$$;

create or replace function public.start_impersonation(p_organization_id uuid, p_target_user_id uuid default null, p_reason text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  if not exists (select 1 from public.organizations where id = p_organization_id) then raise exception 'Resource not found' using errcode='P0002'; end if;
  if p_target_user_id is not null and not exists (select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_target_user_id and active) then raise exception 'Resource not found' using errcode='P0002'; end if;
  update public.impersonation_sessions set ended_at=now(), ended_by=auth.uid() where platform_admin_id=auth.uid() and ended_at is null;
  insert into public.impersonation_sessions(platform_admin_id, organization_id, target_user_id, reason) values(auth.uid(), p_organization_id, p_target_user_id, left(coalesce(p_reason,''),500)) returning id into v_id;
  insert into public.audit_logs(organization_id, branch_id, actor_id, actor_email, action, entity_type, entity_id, details)
  select p_organization_id, b.id, auth.uid(), null, 'impersonation_start', 'organization', p_organization_id::text, jsonb_build_object('targetUserId',p_target_user_id,'reason',left(coalesce(p_reason,''),500)) from public.branches b where b.organization_id=p_organization_id order by b.created_at limit 1;
  return v_id;
end;
$$;

create or replace function public.end_impersonation()
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  update public.impersonation_sessions set ended_at=now(), ended_by=auth.uid() where platform_admin_id=auth.uid() and ended_at is null;
end;
$$;

create policy platform_admins_self_read on public.platform_admins for select to authenticated using (user_id=auth.uid());
create policy impersonation_sessions_platform_read on public.impersonation_sessions for select to authenticated using (platform_admin_id=auth.uid() or public.is_platform_admin());
create policy organizations_platform_read on public.organizations for select to authenticated using (public.is_platform_admin());
create policy profiles_platform_read on public.profiles for select to authenticated using (public.is_platform_admin());
create policy branches_platform_read on public.branches for select to authenticated using (public.is_platform_admin());

revoke all on function public.is_platform_admin(), public.start_impersonation(uuid,uuid,text), public.end_impersonation() from public, anon;
grant execute on function public.is_platform_admin(), public.start_impersonation(uuid,uuid,text), public.end_impersonation() to authenticated;
