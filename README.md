# Gestion Peluqueria

App web de control de gestion para una peluqueria.

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
```

## Variables de entorno

```env
APP_DATA_MODE=supabase
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TZ=America/Santiago
```
