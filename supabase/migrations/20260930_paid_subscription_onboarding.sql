drop function if exists public.create_tenant_onboarding(uuid,text,text,text,text,text);

create function public.create_tenant_onboarding(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_organization_name text,
  p_organization_slug text,
  p_branch_name text,
  p_plan_code text
)
returns table (organization_id uuid, branch_id uuid)
language plpgsql security definer set search_path = public, auth as $$
declare v_organization_id uuid; v_branch_id uuid; v_plan_id uuid;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'Invited user was not found' using errcode = 'P0002'; end if;
  if length(trim(p_full_name)) < 2 or length(trim(p_organization_name)) < 2 or length(trim(p_branch_name)) < 2 or length(trim(p_email)) < 3 then raise exception 'Invalid onboarding data' using errcode = 'P0002'; end if;
  select id into v_plan_id from public.subscription_plans where code = trim(lower(p_plan_code)) and active limit 1;
  if v_plan_id is null then raise exception 'Subscription plan not found' using errcode = 'P0002'; end if;
  insert into public.organizations(name, slug) values (trim(p_organization_name), trim(p_organization_slug)) returning id into v_organization_id;
  insert into public.branches(organization_id, name, timezone) values (v_organization_id, trim(p_branch_name), 'America/Santiago') returning id into v_branch_id;
  insert into public.profiles(id, full_name, email, role, active, organization_id, active_branch_id) values (p_user_id, trim(p_full_name), lower(trim(p_email)), 'admin', true, v_organization_id, v_branch_id);
  insert into public.organization_members(organization_id, user_id, role, active) values (v_organization_id, p_user_id, 'admin', true);
  insert into public.user_branch_access(organization_id, branch_id, user_id, active) values (v_organization_id, v_branch_id, p_user_id, true);
  insert into public.organization_subscriptions(organization_id, plan_id, status, current_period_start, current_period_end, provider)
    values (v_organization_id, v_plan_id, 'pending', now(), now() + interval '1 month', 'mercadopago');
  return query select v_organization_id, v_branch_id;
end;
$$;

revoke all on function public.create_tenant_onboarding(uuid,text,text,text,text,text,text) from public, anon, authenticated;
