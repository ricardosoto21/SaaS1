# Produccion

## Variables en Vercel

```env
APP_DATA_MODE=supabase
NEXT_PUBLIC_SITE_URL=https://dominio-final.cl
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PAYMENT_CREDENTIALS_ENCRYPTION_KEY=
CRON_SECRET=
TZ=America/Santiago
```

`SUPABASE_SERVICE_ROLE_KEY`, `PAYMENT_CREDENTIALS_ENCRYPTION_KEY` y `CRON_SECRET` son solo server-side. La clave de cifrado debe ser una cadena Base64 de 32 bytes, distinta por entorno y rotada con un procedimiento planificado.

## Supabase y Auth

1. Aplicar las migraciones ordenadas de `supabase/migrations`.
2. Configurar Site URL y redirects de recuperación: `https://dominio-final.cl/auth/recovery`.
3. Configurar SMTP/remitente real antes de invitar usuarios.
4. Verificar RLS y la matriz A/B de aislamiento con las pruebas de integración.
5. Los flujos normales usan el cliente autenticado y RLS; `service_role` queda para invitaciones, webhooks y jobs controlados.

## Backups y recuperación

- RPO objetivo: 24 horas; tomar backup lógico antes de migraciones de producción.
- RTO objetivo: 4 horas para recuperación de base y validación funcional básica.
- Activar backups automáticos según el plan contratado de Supabase y definir responsable operativo.
- Restaurar siempre primero en un proyecto aislado, ejecutar smoke tests, y recién entonces programar restauración productiva.
- Conservar evidencia de cada prueba de restauración y su fecha.

## Cron y observabilidad

- Vercel ejecuta `/api/cron/maintenance` cada 15 minutos; protege la ruta con `CRON_SECRET`.
- El job vence holds, encola confirmaciones y recordatorios de 24h/2h de forma idempotente.
- Monitorear `payment_webhook_events`, `message_deliveries`, `audit_logs` y logs de Functions de Vercel.
- El health check es `GET /api/health`; no expone configuración ni datos de clientes.
- Enviar logs a un proveedor de error tracking antes de producción; no registrar cuerpos de request, credenciales, cookies ni notas de clientes.

## Checklist de lanzamiento

- `npm run typecheck`, `npm run lint`, `npm test` y `npm run build` verdes.
- Login, recuperación e invitación validan el dominio final.
- Validar roles admin, recepción y estilista.
- Probar reserva, checkout real sandbox/producción controlada, webhook repetido y anticipo parcial.
- Probar ventas, compras, stock por sucursal, gastos y dashboard.
- Confirmar backups, procedimiento de restore, `CRON_SECRET` y alertas antes de cargar datos reales.