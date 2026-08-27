import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { SubmitButton } from "@/components/forms/submit-button";
import { upsertProfessionalServiceOverrideAction, upsertServiceBranchPricingAction } from "@/lib/actions";
import { getAccessibleBranches, requireRoleForPath } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ServiceCatalogPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRoleForPath("/configuracion");
  if (user.role !== "admin") redirect("/dashboard");
  const [store, branches, params] = await Promise.all([readStore(user), getAccessibleBranches(), searchParams ?? Promise.resolve({})]);
  const supabase = await getSupabaseServerClient();
  const [branchPrices, professionalOverrides] = await Promise.all([
    supabase ? supabase.from("service_branch_pricing").select("branch_id,service_id,price,duration_minutes,active").eq("organization_id", user.organizationId ?? "") : { data: [] },
    supabase ? supabase.from("professional_service_overrides").select("branch_id,professional_id,service_id,price,duration_minutes,active").eq("organization_id", user.organizationId ?? "") : { data: [] },
  ]);

  return <div className="space-y-4"><PageHeader eyebrow="Catálogo" title="Servicios por sucursal" description="Define precio, duración y disponibilidad sin cambiar el valor base." side={<Link className="btn-secondary" href="/configuracion">Volver</Link>} /><PageNotice searchParams={params} />
    <section className="grid gap-4 xl:grid-cols-2"><article className="surface rounded-[1rem] p-5"><p className="label">Sucursal</p><h2 className="mt-1 text-xl font-semibold">Precio y duración</h2><form action={upsertServiceBranchPricingAction} className="mt-5 grid gap-3 md:grid-cols-2"><select className="select-base" name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select className="select-base" name="serviceId" required>{store.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select><input className="input-base" min={0} name="price" placeholder="Precio" required type="number"/><input className="input-base" min={5} name="durationMinutes" placeholder="Minutos" required type="number"/><select className="select-base" name="active"><option value="true">Disponible</option><option value="false">No disponible</option></select><SubmitButton label="Guardar" pendingLabel="Guardando..."/></form></article>
    <article className="surface rounded-[1rem] p-5"><p className="label">Profesional</p><h2 className="mt-1 text-xl font-semibold">Disponibilidad y excepción</h2><form action={upsertProfessionalServiceOverrideAction} className="mt-5 grid gap-3 md:grid-cols-2"><select className="select-base" name="branchId" required>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select className="select-base" name="professionalId" required>{store.professionals.filter((professional) => professional.active).map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select><select className="select-base" name="serviceId" required>{store.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select><select className="select-base" name="active"><option value="true">Disponible</option><option value="false">No disponible</option></select><input className="input-base" min={0} name="price" placeholder="Precio opcional" type="number"/><input className="input-base" min={5} name="durationMinutes" placeholder="Minutos opcional" type="number"/><SubmitButton className="md:col-span-2" label="Guardar" pendingLabel="Guardando..."/></form></article></section>
    <section className="grid gap-4 xl:grid-cols-2"><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Ajustes por sucursal</h2><div className="mt-4 space-y-2 text-sm">{(branchPrices.data ?? []).length ? (branchPrices.data ?? []).map((row) => <p key={`${row.branch_id}-${row.service_id}`}>{branches.find((branch) => branch.id === row.branch_id)?.name ?? "Sucursal"} · {store.services.find((service) => service.id === row.service_id)?.name ?? "Servicio"}: ${Number(row.price).toLocaleString("es-CL")} · {row.duration_minutes} min · {row.active ? "Disponible" : "No disponible"}</p>) : <p className="text-stone-600">Sin ajustes.</p>}</div></article><article className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Excepciones por profesional</h2><div className="mt-4 space-y-2 text-sm">{(professionalOverrides.data ?? []).length ? (professionalOverrides.data ?? []).map((row) => <p key={`${row.branch_id}-${row.professional_id}-${row.service_id}`}>{store.professionals.find((professional) => professional.id === row.professional_id)?.name ?? "Profesional"} · {store.services.find((service) => service.id === row.service_id)?.name ?? "Servicio"}: {row.active ? "Disponible" : "No disponible"}</p>) : <p className="text-stone-600">Sin excepciones.</p>}</div></article></section>
  </div>;
}