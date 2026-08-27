-- El guard de sesión necesita leer únicamente el perfil del usuario autenticado.
-- Separar esta regla evita que la ruta de autolectura evalúe la política administrativa.
drop policy if exists profiles_tenant_read on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_admin_read on public.profiles
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_admin()
  );

-- RLS decide que filas puede leer cada usuario; estos grants habilitan las
-- consultas mínimas que el guard SSR necesita para construir su sesión.
grant usage on schema public to authenticated;
grant select on public.profiles, public.organization_members, public.user_branch_access to authenticated;
