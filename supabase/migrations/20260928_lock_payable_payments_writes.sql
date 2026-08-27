-- Los abonos deben pasar exclusivamente por RPC para que el saldo y el libro
-- de pagos cambien dentro de la misma transaccion.
drop policy if exists payable_payments_tenant_write on public.payable_payments;
revoke insert, update, delete on public.payable_payments from authenticated;
