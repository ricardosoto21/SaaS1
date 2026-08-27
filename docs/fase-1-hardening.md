# Fase 1: hardening multi-tenant

## Alcance y aislamiento

| Scope | Tablas |
| --- | --- |
| Organizacion | `organizations`, `profiles`, `organization_members`, `settings`, `professionals`, `clients`, categorias y `services` |
| Sucursal | `branches`, `user_branch_access`, `professional_branches`, `products`, `appointments`, `appointment_services`, `sales`, `sale_items`, `payments`, `purchases`, `purchase_items`, `expenses`, `inventory_movements`, `audit_logs` |

La sucursal activa reside en `profiles.active_branch_id`. El selector del layout solo ofrece sucursales visibles por RLS y `set_active_branch` vuelve a validar la membresia y acceso activo dentro de PostgreSQL. Un profesional usa `professional_branches`, por lo que puede pertenecer a mas de una sucursal.

## Matriz RLS

| Grupo de tablas | RLS | SELECT | INSERT / UPDATE / DELETE | Scope |
| --- | --- | --- | --- | --- |
| `organizations` | Si | miembro de la organizacion | no directo | organizacion |
| `branches` | Si | solo sucursales con acceso | no directo | sucursal |
| `profiles`, `organization_members`, `user_branch_access` | Si | propio o admin del tenant | admin del tenant | organizacion / acceso |
| `settings`, `professionals`, `clients`, categorias, `services` | Si | tenant activo | admin del tenant | organizacion |
| `professional_branches` | Si | tenant y sucursal autorizada | admin del tenant | sucursal |
| `products`, `appointments`, `sales`, `purchases`, `expenses`, inventario y lineas relacionadas | Si | tenant y sucursal autorizada | admin del tenant o RPC transaccional | sucursal |
| `audit_logs` | Si | tenant y sucursal autorizada | solo RPC de auditoria | sucursal |

Ademas de RLS, `assert_branch_matches_organization` rechaza cualquier `branch_id` de otra organizacion en todas las tablas con alcance de sucursal. `assert_professional_branch_tenant` impide asignar un profesional de otra organizacion. Ambas funciones usan `SECURITY DEFINER`, `search_path = public` y no se conceden a `authenticated`.

## RPC transaccionales

| Funcion | Operacion | Valida tenant/sucursal | Atomica | Acceso |
| --- | --- | --- | --- | --- |
| `tenant_create_appointment_transaction` | cita y lineas | si / si | si | authenticated |
| `tenant_update_appointment_status_transaction` | estado de cita | si / cita | si | authenticated |
| `tenant_convert_appointment_to_sale_transaction` | cierre de cita | si / si | si | authenticated |
| `tenant_create_manual_sale_transaction` | venta, items, stock | si / si | si | authenticated |
| `tenant_record_payment_transaction` | abono y saldo | si / si | si | authenticated |
| `tenant_create_purchase_transaction` | compra, items, stock | si / si | si | authenticated |
| `tenant_adjust_stock_transaction` | ajuste y movimiento | si / si | si | authenticated |
| `tenant_create_expense_transaction` | gasto | si / si | si | authenticated |
| `tenant_record_purchase_payable_payment` | abono de compra | si / si | si | authenticated/admin |
| `tenant_record_expense_payable_payment` | pago de gasto pendiente | si / si | si | authenticated/admin |
| `set_active_branch` | cambiar sucursal | si / si | si | authenticated |
| `record_tenant_audit` | evento de seguridad | si / si | si | authenticated |

Todas las RPC de negocio pasan por `assert_tenant_access`, toman el actor desde `auth.uid()` y fijan `search_path`. Los identificadores enviados por cliente se verifican contra tenant y sucursal antes de modificar filas. Los errores remotos se reducen a `Access denied` o `Resource not found`, sin revelar pertenencia de otro tenant.

`payable_payments` no permite inserciones directas a `authenticated`: sus filas solo se crean desde las RPC de abono, que actualizan el pago y el saldo en una misma transaccion.

## service_role

No se utiliza para consultas ni mutaciones normales de clientes, agenda, ventas, inventario, compras o gastos. Los usos restantes estan limitados a onboarding/control de Auth, endpoints publicos controlados de reservas, webhook de pago, rate limits y mantenimiento programado. Los fixtures de integracion lo usan para crear y desmontar datos temporales; nunca se envian al navegador.

## Pruebas reales

Las pruebas crean organizaciones A/B, sucursales, usuarios autenticados y recursos operacionales. Verifican lectura, insercion, actualizacion, borrado, RPC, cambio de sucursal no autorizado e IDOR por UUID. Tambien prueban que la integridad de base rechaza referencias cruzadas incluso con `service_role`.

```powershell
$env:RUN_SUPABASE_INTEGRATION='1'
$env:NODE_EXTRA_CA_CERTS=(Resolve-Path '.certs\avast-webmail-shield-root.pem')
node --env-file=.env.local --test --test-concurrency=1 tests/supabase-tenant-isolation.test.mjs tests/supabase-tenant-matrix.test.mjs
```

## Migracion legacy y rollback

`20260826_phase1_multi_tenancy.sql` crea de forma idempotente `Legacy Salon` y `Sucursal principal`, y asigna los registros existentes al tenant inicial. Cubre perfiles, profesionales, clientes, servicios, productos, citas, ventas, compras, inventario, gastos y entidades relacionadas. El rollback seguro es restaurar un backup previo: no se eliminan tenants ni datos operativos automaticamente.

## Riesgo de agenda

Fase 1 no declaraba reservas publicas ni disponibilidad concurrente resuelta. La proteccion de solapamientos se implementa en la migracion posterior de disponibilidad; no es un requisito operativo de esta fase.
