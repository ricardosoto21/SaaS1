-- El patrón de serializar y reemplazar el store completo no es seguro en un SaaS concurrente.
drop function if exists public.replace_app_store(jsonb);
