# Produccion

## Variables

Configurar en Vercel:

```env
APP_DATA_MODE=supabase
NEXT_PUBLIC_SITE_URL=https://dominio-final.cl
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TZ=America/Santiago
```

`SUPABASE_SERVICE_ROLE_KEY` debe existir solo en el entorno server-side de Vercel. No debe exponerse en el navegador.

## Supabase

1. Crear proyecto Supabase.
2. Ejecutar todas las migraciones en orden desde `supabase/migrations`.
3. Crear el primer usuario admin desde Supabase Auth.
4. Insertar o actualizar su fila en `public.profiles` con `role = 'admin'` y `active = true`.
5. Confirmar que RLS esta activo en tablas de negocio.
6. Confirmar que las RPC transaccionales solo tienen `execute` para `service_role`.

Ejemplo para primer admin:

```sql
update public.profiles
set role = 'admin', active = true
where email = 'correo-admin@dominio.cl';
```

## Backups

- Activar backups automaticos del proyecto Supabase.
- Antes de cambios grandes, tomar backup manual desde Supabase.
- Mantener documentado quien puede restaurar y en que horario.
- Probar restauracion en un proyecto Supabase separado antes de tocar produccion.

## Auth

- Configurar Site URL en Supabase Auth con el dominio final.
- Agregar Redirect URLs:
  - `https://dominio-final.cl/auth/recovery`
  - `https://*.vercel.app/auth/recovery` solo para previews si se van a probar recuperaciones desde preview.
- Configurar SMTP/remitente real antes de operar con usuarios reales.
- Confirmar recuperacion de clave e invitacion de usuarios desde el dominio final.

## Monitoreo

- Revisar errores de Functions y build logs en Vercel despues de cada deploy.
- Revisar `audit_logs` para pagos, ventas, stock, gastos, usuarios y citas.
- Activar alertas del proyecto Supabase para uso de base de datos y errores.

## Checklist De Lanzamiento

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Login con Supabase para `admin`, `recepcion` y `estilista`.
- Crear profesional, usuario, cliente, servicio y producto.
- Crear cita y verla en agenda diaria, semanal y mensual.
- Convertir cita a venta y registrar abonos hasta `paid`.
- Crear venta manual de producto y verificar descuento de stock.
- Registrar compra y verificar aumento de stock/costo.
- Registrar gasto y confirmar dashboard.
- Confirmar que `APP_DATA_MODE=local` no se usa en produccion.
- Confirmar que ventas, pagos, compras, ajustes de stock, citas y gastos no usan `replace_app_store`.
- Confirmar backup automatico activo antes de cargar datos reales.
