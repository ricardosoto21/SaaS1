-- Atomic tenant member and professional provisioning.
-- The caller remains an authenticated organization admin; service-role is only used for Supabase Auth invitations.
create or replace function public.tenant_create_professional(
  p_id text,
  p_full_name text,
  p_specialty text,
  p_color text,
  p_organization_id uuid,
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() or p_organization_id <> public.current_organization_id() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_branch_access where organization_id = p_organization_id and branch_id = p_branch_id and user_id = auth.uid() and active) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  if length(trim(p_id)) < 1 or length(trim(p_full_name)) < 1 then
    raise exception 'Invalid professional data' using errcode = 'P0002';
  end if;

  insert into public.professionals(id, organization_id, full_name, specialty, color, active)
  values (p_id, p_organization_id, trim(p_full_name), left(coalesce(p_specialty, ''), 300), coalesce(nullif(trim(p_color), ''), '#0f766e'), true);
  insert into public.professional_branches(organization_id, professional_id, branch_id, active)
  values (p_organization_id, p_id, p_branch_id, true);
end;
$$;

create or replace function public.tenant_provision_invited_member(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_role public.app_role,
  p_professional_id text,
  p_organization_id uuid,
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null or not public.is_admin() or p_organization_id <> public.current_organization_id() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_branch_access where organization_id = p_organization_id and branch_id = p_branch_id and user_id = auth.uid() and active) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Invited user was not found' using errcode = 'P0002';
  end if;
  if length(trim(p_full_name)) < 2 or length(trim(p_email)) < 3 then
    raise exception 'Invalid user data' using errcode = 'P0002';
  end if;
  if p_role = 'estilista' and (p_professional_id is null or not exists (select 1 from public.professionals where id = p_professional_id and organization_id = p_organization_id and active)) then
    raise exception 'Invalid professional assignment' using errcode = 'P0002';
  end if;

  insert into public.profiles(id, full_name, email, role, professional_id, active, organization_id, active_branch_id)
  values (p_user_id, trim(p_full_name), lower(trim(p_email)), p_role, p_professional_id, true, p_organization_id, p_branch_id);
  insert into public.organization_members(organization_id, user_id, role, active)
  values (p_organization_id, p_user_id, p_role, true);
  insert into public.user_branch_access(organization_id, branch_id, user_id, active)
  values (p_organization_id, p_branch_id, p_user_id, true);
end;
$$;

revoke all on function public.tenant_create_professional(text,text,text,text,uuid,uuid) from public, anon;
revoke all on function public.tenant_provision_invited_member(uuid,text,text,public.app_role,text,uuid,uuid) from public, anon;
grant execute on function public.tenant_create_professional(text,text,text,text,uuid,uuid) to authenticated;
grant execute on function public.tenant_provision_invited_member(uuid,text,text,public.app_role,text,uuid,uuid) to authenticated;