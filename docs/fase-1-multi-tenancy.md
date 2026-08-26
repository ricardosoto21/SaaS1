# Fase 1: multi-tenancy

## Estado actual

La aplicacion conserva sus modulos operativos: clientes, agenda, ventas, pagos, inventario, compras, gastos, dashboard y configuracion. Supabase Auth y los Server Actions ya existian, al igual que operaciones transaccionales para ventas, pagos, compras y stock.

Antes de esta fase el modelo era de un solo salon. Las tablas no tenian `organization_id` ni `branch_id`; `readSupabaseStore` usaba la clave de servicio y leia todas las filas; RLS solo separaba roles, no empresas. Esto permitia que un error de servidor pudiera mezclar datos de distintos negocios.

## Auditoria del repositorio

### Rutas y modulos

Rutas privadas actuales: `/dashboard`, `/agenda`, `/clientes`, `/ventas`, `/inventario`, `/compras`, `/gastos` y `/configuracion`. Tambien existen `/login`, `/auth/callback`, `/auth/recovery` y `/reset-password`.

Los modulos reutilizables son los formularios de cita/venta/compra, calendario, paginacion, filtros de `src/lib/listing.ts`, calculos de `src/lib/data.ts`, autenticacion en `src/lib/auth.ts`, acciones de servidor en `src/lib/actions.ts` y las RPC transaccionales ya disponibles en `supabase/migrations/20260609_transactional_operations.sql`.

### Tablas y relaciones anteriores

El esquema original contiene `profiles`, `settings`, `professionals`, clientes, categorías, servicios, productos, citas y líneas de cita, ventas y líneas de venta, pagos, compras y líneas de compra, gastos, movimientos de inventario y auditoría.

Sus relaciones principales son: cita -> cliente/profesional/servicios; venta -> cliente/profesional/cita/items/pagos; compra -> items -> productos; gasto -> categoría; movimiento -> producto. Las claves eran globales, sin pertenencia a empresa o sucursal.

### Auth y RLS antes de Fase 1

Supabase Auth obtiene el usuario y el perfil activo. Las rutas y Server Actions aplican control de rol `admin`, `recepcion` y `estilista`. RLS estaba habilitado, pero las políticas dependían de `current_app_role()` y daban acceso al mismo conjunto completo de datos a todo el personal del salón. No existía aislamiento entre empresas ni una verificación de sucursal.

### Problemas y riesgos encontrados

- La clave de servicio se usaba para lecturas generales, por lo que una omisión de filtro podía exponer datos de todos los salones.
- IDs de profesionales, servicios, productos y categorías podían repetirse entre empresas porque varios se derivaban del nombre.
- SKU y nombres de categoría eran únicos globalmente, una restricción incorrecta para un SaaS.
- Las transacciones validaban referencias por ID, pero no su pertenencia a tenant.
- No existen aún pruebas de integración autenticadas contra dos tenants; las pruebas locales no pueden demostrar RLS remoto.

### Archivos modificados o creados

- Crear `supabase/migrations/20260826_phase1_multi_tenancy.sql`.
- Crear `src/lib/tenant.ts` y `tests/phase1-multi-tenancy.test.mjs`.
- Modificar `src/lib/auth.ts`, `src/lib/store.ts`, `src/lib/supabase-store.ts`, `src/lib/actions.ts`, `src/lib/types.ts` y las ocho páginas protegidas para propagar el scope.
- Modificar `package.json` y `README.md`.

## Arquitectura conservada

```text
Next.js UI
  -> Server Actions
  -> tenantScopeFromUser
  -> Supabase repositories/RPC
  -> PostgreSQL + RLS
```

La UI no llama directamente a Supabase. La logica critica permanece en Server Actions y RPC de PostgreSQL. `readStore(user)` exige ahora un usuario con organizacion y sucursal activas cuando se usa Supabase.

## Modelo introducido

```text
organization
  -> branches
  -> organization_members
  -> user_branch_access
  -> professionals -> professional_branches
  -> clients (organization)
  -> services/categories (organization)
  -> products, appointments, sales, purchases, expenses, stock (organization + branch)
```

`clients` se mantiene a nivel organizacion. Los registros operativos y de inventario quedan asociados a una sucursal. Los profesionales pertenecen a una organizacion y se vinculan a una o mas sucursales mediante `professional_branches`.

## Migracion

La migracion [20260826_phase1_multi_tenancy.sql](/C:/Users/Riki/Documents/App%20gestion%20peluqueria/supabase/migrations/20260826_phase1_multi_tenancy.sql) hace lo siguiente:

- Crea `organizations`, `branches`, membresias, accesos de sucursal y relaciones profesional-sucursal.
- Crea de manera idempotente `Legacy Salon` y `Sucursal principal`.
- Asigna las filas existentes a ese tenant; no borra ni transforma valores operativos.
- Añade `organization_id` a los datos del negocio y `branch_id` a los datos operativos.
- Convierte categorías y SKU en únicos dentro de su tenant, no globalmente.
- Reemplaza las políticas RLS de salón único por políticas de organización y acceso a sucursal.
- Envuelve las RPC existentes con validación de tenant antes de ejecutar la transacción original.

Aplicar en Supabase antes de desplegar este código. Una vez aplicada, confirmar desde SQL Editor que existen las tablas, que las filas antiguas tienen los IDs de tenant y que RLS está habilitado.

## Permisos de Fase 1

- `admin`: administra usuarios y configuración dentro de su organización.
- `recepcion` y `estilista`: conservan los permisos funcionales actuales; cada Server Action valida el rol antes de operar.
- RLS restringe lecturas a la organización activa y, para datos operativos, a las sucursales habilitadas para el usuario.
- El rol vigente se conserva como `estilista` para compatibilidad. La normalización a `profesional` y el selector de organizaciones/sucursales quedan para Fase 2.

## Riesgos y decisiones pendientes

- La migración debe ejecutarse una vez en el proyecto Supabase antes de usar este commit con datos reales.
- El código actual usa una sucursal activa por usuario; la interfaz de selector de sucursal y el alta comercial de organizaciones se implementan en Fase 2/onboarding.
- Los límites comerciales de planes, billing, Super Admin, reservas públicas, SumUp, WhatsApp, DTE, comisiones y reportes ampliados están fuera de Fase 1.
- Las RPC se protegen por la validación de tenant en servidor y en la propia wrapper SQL. La prueba de RLS real requiere dos usuarios autenticados contra Supabase, por lo que debe ejecutarse en un entorno conectado.

## Pruebas de aceptacion pendientes en Supabase

1. Crear dos organizaciones, dos sucursales y dos usuarios autenticados.
2. Insertar clientes, productos y citas en cada organización.
3. Con el token de Organización A, intentar leer/editar IDs de Organización B y verificar resultado vacío o `permission denied`.
4. Repetir para ventas, pagos, compras, gastos, movimientos de inventario y perfiles.
5. Verificar que un profesional sin acceso a una sucursal no puede crear ni ver citas de ella.
6. Ejecutar venta, compra, pago y ajuste de stock por cada tenant; verificar que la RPC rechaza referencias cruzadas.
