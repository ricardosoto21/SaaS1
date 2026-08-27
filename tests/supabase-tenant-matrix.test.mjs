import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const { createClient } = enabled ? await import("@supabase/supabase-js") : {};
class DisabledTransport { constructor() { this.readyState = 3; } close() {} addEventListener() {} removeEventListener() {} }
const clientOptions = { realtime: { transport: DisabledTransport }, auth: { persistSession: false, autoRefreshToken: false } };

test("matriz A/B bloquea entidades operacionales e IDOR", { skip: !enabled }, async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && anon && service, "Faltan variables Supabase para integracion.");
  const admin = createClient(url, service, clientOptions); const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID(), orgB = randomUUID(), branchA = randomUUID(), branchA2 = randomUUID(), branchB = randomUUID();
  const email = `matrix-a-${suffix}@example.test`, password = `Phase1!${suffix}aA`; let user;
  t.after(async () => { await admin.from("organizations").delete().in("id", [orgA, orgB]); if (user) await admin.auth.admin.deleteUser(user.id); });
  await admin.from("organizations").insert([{ id: orgA, name: "A", slug: `matrix-a-${suffix}` }, { id: orgB, name: "B", slug: `matrix-b-${suffix}` }]).throwOnError();
  await admin.from("branches").insert([{ id: branchA, organization_id: orgA, name: "A1" }, { id: branchA2, organization_id: orgA, name: "A2" }, { id: branchB, organization_id: orgB, name: "B1" }]).throwOnError();
  user = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user; assert.ok(user);
  await admin.from("profiles").upsert({ id: user.id, full_name: "Admin A", email, role: "admin", active: true, organization_id: orgA, active_branch_id: branchA }).throwOnError();
  await admin.from("organization_members").upsert({ organization_id: orgA, user_id: user.id, role: "admin", active: true }).throwOnError();
  await admin.from("user_branch_access").upsert({ organization_id: orgA, branch_id: branchA, user_id: user.id, active: true }).throwOnError();
  const ids = { client: `matrix-client-${suffix}`, professional: `matrix-pro-${suffix}`, productCategory: `matrix-product-cat-${suffix}`, expenseCategory: `matrix-expense-cat-${suffix}`, product: `matrix-product-${suffix}`, appointment: `matrix-appt-${suffix}`, sale: `matrix-sale-${suffix}`, purchase: `matrix-purchase-${suffix}`, expense: `matrix-expense-${suffix}`, movement: `matrix-move-${suffix}` };
  await admin.from("product_categories").insert({ id: ids.productCategory, organization_id: orgB, name: `Productos ${suffix}` }).throwOnError();
  await admin.from("expense_categories").insert({ id: ids.expenseCategory, organization_id: orgB, name: `Gastos ${suffix}` }).throwOnError();
  await admin.from("professionals").insert({ id: ids.professional, organization_id: orgB, full_name: "Profesional B" }).throwOnError();
  await admin.from("professional_branches").insert({ organization_id: orgB, professional_id: ids.professional, branch_id: branchB, active: true }).throwOnError();
  await admin.from("clients").insert({ id: ids.client, organization_id: orgB, full_name: "Cliente B", phone: "2" }).throwOnError();
  await admin.from("products").insert({ id: ids.product, organization_id: orgB, branch_id: branchB, name: "Producto B", category_id: ids.productCategory, sku: `sku-${suffix}`, current_cost: 1, sale_price: 2, current_stock: 4 }).throwOnError();
  await admin.from("appointments").insert({ id: ids.appointment, organization_id: orgB, branch_id: branchB, client_id: ids.client, professional_id: ids.professional, start_at: new Date().toISOString(), total_duration_minutes: 30 }).throwOnError();
  await admin.from("sales").insert({ id: ids.sale, organization_id: orgB, branch_id: branchB, client_id: ids.client, professional_id: ids.professional, origin: "manual", sold_at: new Date().toISOString(), total: 2, amount_due: 2 }).throwOnError();
  await admin.from("purchases").insert({ id: ids.purchase, organization_id: orgB, branch_id: branchB, purchased_at: new Date().toISOString(), supplier: "B", category_name: "B", total: 1 }).throwOnError();
  await admin.from("expenses").insert({ id: ids.expense, organization_id: orgB, branch_id: branchB, spent_at: new Date().toISOString(), category_id: ids.expenseCategory, description: "B", amount: 1 }).throwOnError();
  await admin.from("inventory_movements").insert({ id: ids.movement, organization_id: orgB, branch_id: branchB, product_id: ids.product, movement_type: "adjustment", quantity: 1, happened_at: new Date().toISOString() }).throwOnError();
  // Database integrity must also reject cross-tenant references when RLS is bypassed.
  const mismatchedBranch = await admin.from("products").insert({ id: `mismatch-${suffix}`, organization_id: orgA, branch_id: branchB, name: "Invalid", sku: `invalid-${suffix}`, current_cost: 1, sale_price: 1, current_stock: 0 });
  assert.ok(mismatchedBranch.error, "la integridad de tenant debe rechazar branch de otra organizacion");
  const mismatchedProfessional = await admin.from("professional_branches").insert({ organization_id: orgA, professional_id: ids.professional, branch_id: branchA, active: true });
  assert.ok(mismatchedProfessional.error, "un profesional de B no puede asignarse a una sucursal de A");
  const client = createClient(url, anon, clientOptions); await client.auth.signInWithPassword({ email, password });
  for (const [table, id] of [["organizations", orgB], ["branches", branchB], ["clients", ids.client], ["appointments", ids.appointment], ["sales", ids.sale], ["purchases", ids.purchase], ["products", ids.product], ["inventory_movements", ids.movement], ["expenses", ids.expense]]) {
    const { data, error } = await client.from(table).select("id").eq("id", id); assert.equal(error, null, `${table} no debe filtrar error sensible`); assert.deepEqual(data, [], `${table} B debe quedar oculto`);
  }
  assert.equal((await client.from("appointments").update({ notes: "IDOR" }).eq("id", ids.appointment).select("id")).data?.length, 0, "IDOR de cita bloqueado");
  assert.equal((await client.from("products").delete().eq("id", ids.product).select("id")).data?.length, 0, "IDOR de producto bloqueado");
  assert.ok((await client.from("clients").insert({ id: `bad-${suffix}`, organization_id: orgB, full_name: "Bad", phone: "x" })).error, "insert cross-tenant bloqueado");
  assert.ok((await client.rpc("set_active_branch", { p_branch_id: branchA2 })).error, "sucursal propia sin acceso bloqueada");
  assert.ok((await client.rpc("tenant_create_purchase_transaction", { payload: { id: `bad-purchase-${suffix}`, organizationId: orgB, branchId: branchB, purchasedAt: new Date().toISOString(), supplier: "x", categoryName: "x", items: [] } })).error, "RPC cross-tenant bloqueada");
});
