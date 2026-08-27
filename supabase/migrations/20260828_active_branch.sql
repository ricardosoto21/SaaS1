create or replace function public.set_active_branch(p_branch_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid := public.current_organization_id();
begin
  if v_org is null or not public.has_branch_access(p_branch_id) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  update public.profiles set active_branch_id=p_branch_id
  where id=auth.uid() and organization_id=v_org and active=true;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
end $$;
grant execute on function public.set_active_branch(uuid) to authenticated;
