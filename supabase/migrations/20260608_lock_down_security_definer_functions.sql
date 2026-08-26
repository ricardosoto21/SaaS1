revoke execute on function public.replace_app_store(jsonb) from public, anon, authenticated;
grant execute on function public.replace_app_store(jsonb) to service_role;

revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;

grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
