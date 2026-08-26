import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/20260826_phase1_multi_tenancy.sql", import.meta.url);

test("Fase 1 define organizaciones, sucursales y aislamiento de tenant", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const requiredFragment of [
    "create table if not exists public.organizations",
    "create table if not exists public.branches",
    "create table if not exists public.organization_members",
    "create table if not exists public.user_branch_access",
    "create table if not exists public.professional_branches",
    "create or replace function public.current_organization_id()",
    "create or replace function public.has_branch_access",
    "tenant_create_appointment_transaction",
    "tenant_create_manual_sale_transaction",
    "tenant_record_payment_transaction",
    "Legacy Salon",
  ]) {
    assert.ok(sql.includes(requiredFragment), `Falta ${requiredFragment}`);
  }
});

test("Las tablas operacionales quedan indexadas y protegidas por organizacion/sucursal", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /appointments_tenant_start_idx/);
  assert.match(sql, /sales_tenant_sold_at_idx/);
  assert.match(sql, /organization_id = public\.current_organization_id\(\)/);
  assert.match(sql, /public\.has_branch_access\(branch_id\)/);
  assert.match(sql, /alter column organization_id set not null/);
  assert.match(sql, /alter column branch_id set not null/);
});
