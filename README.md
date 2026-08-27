# Gestion Peluqueria

App web de control de gestion para una peluqueria.

El repositorio esta en transicion a SaaS multiempresa. La Fase 1 introduce organizaciones, sucursales y aislamiento por tenant; consulta [docs/fase-1-multi-tenancy.md](/C:/Users/Riki/Documents/App%20gestion%20peluqueria/docs/fase-1-multi-tenancy.md) antes de aplicar las migraciones en Supabase.

## Incluye

- Login privado con roles `admin`, `recepcion` y `estilista`
- Dashboard mensual con filtros
- Agenda con vista diaria, semanal y mensual
- Clientes con historial y saldo pendiente
- Ventas manuales y ventas desde citas
- Pagos parciales
- Inventario, compras y ajustes de stock
- Gastos operativos
- Configuracion de usuarios, profesionales, servicios y productos

## Datos

La app parte limpia.

- No carga datos anteriores.
- En produccion usa Supabase Postgres y Auth con `APP_DATA_MODE=supabase`.
- El modo local con `data/app-store.json` queda solo para desarrollo aislado.
- Las migraciones estan en `supabase/migrations`.

## Desarrollo local

```bash
npm run dev -- -p 3001
```

Luego abre `http://localhost:3001`.

Si necesitas probar sin Supabase, usa `APP_DATA_MODE=local`. En ese modo existe un acceso local de desarrollo:

- `admin@peluqueria.local` / `admin123`

No usar este acceso en produccion.

## Produccion

Ver [docs/produccion.md](/C:/Users/Riki/Documents/App%20gestion%20peluqueria/docs/produccion.md).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
```

## Variables de entorno

```env
APP_DATA_MODE=supabase
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PAYMENT_CREDENTIALS_ENCRYPTION_KEY=
CRON_SECRET=
WHATSAPP_CLOUD_ACCESS_TOKEN=
WHATSAPP_CLOUD_PHONE_NUMBER_ID=
WHATSAPP_CLOUD_VERIFY_TOKEN=
WHATSAPP_CLOUD_APP_SECRET=
MERCADOPAGO_SUBSCRIPTIONS_ACCESS_TOKEN=
MERCADOPAGO_SUBSCRIPTION_PLAN_IDS=
MERCADOPAGO_WEBHOOK_SECRET=
TZ=America/Santiago
```
