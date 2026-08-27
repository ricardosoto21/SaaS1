-- Writes audit events with the caller identity and tenant context, never with a client-supplied actor.
create or replace function public.record_tenant_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb,
  p_organization_id uuid,
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  perform public.assert_tenant_access(p_organization_id, p_branch_id);
  select email into v_email from public.profiles where id = auth.uid() and organization_id = p_organization_id;
  insert into public.audit_logs (organization_id, branch_id, actor_id, actor_email, action, entity_type, entity_id, details)
  values (p_organization_id, p_branch_id, auth.uid(), coalesce(v_email, ''), left(p_action, 80), left(p_entity_type, 80), nullif(left(p_entity_id, 160), ''), coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function public.record_tenant_audit(text, text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.record_tenant_audit(text, text, text, jsonb, uuid, uuid) to authenticated;
