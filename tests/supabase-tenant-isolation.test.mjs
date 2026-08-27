import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const enabled = process.env.RUN_SUPABASE_INTEGRATION === "1";
const { createClient } = enabled ? await import("@supabase/supabase-js") : {};
class DisabledTransport { constructor() { this.readyState = 3; } close() {} addEventListener() {} removeEventListener() {} }
const clientOptions = { realtime: { transport: DisabledTransport }, auth: { persistSession: false, autoRefreshToken: false } };

test("RLS bloquea lectura e insercion cross-tenant", { skip: !enabled }, async (t) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url && anon && serviceKey, "Faltan variables Supabase para integración.");

  const admin = createClient(url, serviceKey, clientOptions);
  const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID(); const orgB = randomUUID();
  const branchA = randomUUID(); const branchB = randomUUID();
  const emailA = `rls-a-${suffix}@example.test`; const emailB = `rls-b-${suffix}@example.test`;
  const password = `Phase1!${suffix}aA`;
  let userA; let userB;

  t.after(async () => {
    await admin.from("organizations").delete().in("id", [orgA, orgB]);
    if (userA) await admin.auth.admin.deleteUser(userA.id);
    if (userB) await admin.auth.admin.deleteUser(userB.id);
  });

  await admin.from("organizations").insert([{ id: orgA, name: "RLS A", slug: `rls-a-${suffix}` }, { id: orgB, name: "RLS B", slug: `rls-b-${suffix}` }]).throwOnError();
  await admin.from("branches").insert([{ id: branchA, organization_id: orgA, name: "A" }, { id: branchB, organization_id: orgB, name: "B" }]).throwOnError();
  userA = (await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true })).data.user;
  userB = (await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true })).data.user;
  assert.ok(userA && userB);
  for (const [user, email, org, branch] of [[userA,emailA,orgA,branchA],[userB,emailB,orgB,branchB]]) {
    await admin.from("profiles").upsert({ id:user.id, full_name:"RLS", email, role:"admin", active:true, organization_id:org, active_branch_id:branch }).throwOnError();
    await admin.from("organization_members").upsert({ organization_id:org, user_id:user.id, role:"admin", active:true }).throwOnError();
    await admin.from("user_branch_access").upsert({ organization_id:org, branch_id:branch, user_id:user.id, active:true }).throwOnError();
  }
  const clientA = createClient(url, anon, clientOptions);
  await clientA.auth.signInWithPassword({ email:emailA, password });
  const clientBId = `rls-client-b-${suffix}`;
  await admin.from("clients").insert([{ id:`rls-client-a-${suffix}`, organization_id:orgA, full_name:"A", phone:"1" }, { id:clientBId, organization_id:orgB, full_name:"B", phone:"2" }]).throwOnError();
  const crossRead = await clientA.from("clients").select("id").eq("id", clientBId);
  assert.equal(crossRead.error, null); assert.deepEqual(crossRead.data, []);
  const crossInsert = await clientA.from("clients").insert({ id:`rls-bad-${suffix}`, organization_id:orgB, full_name:"Bad", phone:"3" });
  assert.ok(crossInsert.error, "RLS debe rechazar insert cross-tenant");
  const crossUpdate = await clientA.from("clients").update({ full_name:"Leak" }).eq("id", clientBId).select("id");
  assert.equal(crossUpdate.data?.length, 0, "RLS debe rechazar update cross-tenant");
  const crossDelete = await clientA.from("clients").delete().eq("id", clientBId).select("id");
  assert.equal(crossDelete.data?.length, 0, "RLS debe rechazar delete cross-tenant");
  const stillExists = await admin.from("clients").select("full_name").eq("id", clientBId).single();
  assert.equal(stillExists.data.full_name, "B", "Un IDOR no puede modificar ni eliminar datos ajenos");
  const crossBranch = await clientA.rpc("set_active_branch", { p_branch_id: branchB });
  assert.ok(crossBranch.error, "No debe permitir seleccionar una sucursal ajena");
  const crossRpc = await clientA.rpc("tenant_create_purchase_transaction", { payload: { id:`bad-purchase-${suffix}`, purchasedAt:new Date().toISOString(), supplier:"x", categoryName:"x", organizationId:orgB, branchId:branchB, items:[] } });
  assert.ok(crossRpc.error, "RPC debe rechazar tenant ajeno");
});
