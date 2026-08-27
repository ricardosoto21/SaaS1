-- El rol authenticated necesita privilegios SQL para que RLS pueda decidir el acceso.
-- No otorga acceso cross-tenant: todas estas tablas mantienen RLS habilitado.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
