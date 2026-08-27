# Fase 1: hardening multi-tenant

## Alcance de datos

| Scope | Tablas |
| --- | --- |
| Organizacion | `organizations`, `profiles`, `organization_members`, `settings`, `professionals`, `clients`, categorias, `services` |
| Sucursal | `branches`, `user_branch_access`, `professional_branches`, `products`, `appointments`, `appointment_services`, `sales`, `sale_items`, `payments`, `purchases`, `purchase_items`, `expenses`, `inventory_movements`, `audit_logs` |

Todas las tablas anteriores tienen RLS habilitado. Las lecturas exigen organizacion activa; las tablas de sucursal exigen ademas `has_branch_access(branch_id)`. Las mutaciones directas quedan limitadas a administradores del tenant. Las operaciones de negocio usan RPC con validacion de tenant y sucursal.

## RPC y funciones SECURITY DEFINER

| Funcion | Uso | Validacion | Atomica |
| --- | --- | --- | --- |
| `tenant_create_appointment_transaction` | cita y servicios | usuario, org, sucursal, cliente y profesional | Si |
| `tenant_update_appointment_status_transaction` | estado de cita | usuario, org, sucursal de la cita | Si |
| `tenant_convert_appointment_to_sale_transaction` | cierre de cita | usuario, org, sucursal y cita | Si |
| `tenant_create_manual_sale_transaction` | venta e inventario | usuario, org, sucursal, cliente, profesional e items | Si |
| `tenant_record_payment_transaction` | abono y saldo | usuario, org, sucursal y venta | Si |
| `tenant_create_purchase_transaction` | compra y stock | usuario, org, sucursal y productos | Si |
| `tenant_adjust_stock_transaction` | ajuste y movimiento | usuario, org, sucursal y producto | Si |
| `tenant_create_expense_transaction` | gasto | usuario, org, sucursal y categoria | Si |
| `set_active_branch` | cambiar sucursal | usuario y acceso activo a sucursal | Si |
| `record_tenant_audit` | auditoria | usuario, org y sucursal; actor desde `auth.uid()` | Si |

Cada funcion `SECURITY DEFINER` fija `search_path = public`, limita `EXECUTE` a `authenticated` y valida el tenant antes de delegar en la operacion transaccional.

## service_role

El unico uso de aplicacion es `auth.admin.inviteUserByEmail` en `createUserAction`. Es necesario para crear la invitacion de Supabase Auth. Las escrituras posteriores de perfil, membresia y acceso de sucursal usan el cliente SSR del administrador autenticado y RLS. El cliente `service_role` tambien se usa solo en fixtures de pruebas de integracion y nunca se expone al navegador.

## Pruebas de integracion

Ejecutar con credenciales de desarrollo de Supabase:

```powershell
$env:RUN_SUPABASE_INTEGRATION='1'
$env:NODE_EXTRA_CA_CERTS=(Resolve-Path '.certs\avast-webmail-shield-root.pem')
node --env-file=.env.local --test --test-concurrency=1 tests/supabase-tenant-isolation.test.mjs
```

La prueba crea fixtures temporales A/B, autentica usuarios reales y valida RLS para lectura, insercion, actualizacion, borrado, RPC, IDOR y sucursal no autorizada. El teardown elimina primero organizaciones y luego usuarios Auth.

## Migracion legacy y rollback

`20260826_phase1_multi_tenancy.sql` crea `Legacy Salon` y `Sucursal principal` con UUIDs estables, agrega los IDs de tenant a las tablas previas y asigna los registros existentes de forma idempotente. El rollback seguro consiste en restaurar un backup previo a la migracion; no se elimina automaticamente informacion de tenants porque puede contener datos ya operativos.

## Riesgo conocido: doble reserva

La cita se valida contra solapamientos dentro de la transaccion actual. Aun no hay exclusion constraint por rango horario, por lo que dos solicitudes concurrentes pueden requerir la proteccion adicional de Fase 3. No hay reservas publicas en Fase 1.
