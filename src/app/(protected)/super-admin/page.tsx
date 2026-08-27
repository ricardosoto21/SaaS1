import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { SubmitButton } from "@/components/forms/submit-button";
import { endImpersonationAction, startImpersonationAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  if (user.role !== "super_admin") redirect("/dashboard");
  const supabase = await getSupabaseServerClient();
  const organizationResponse = supabase ? await supabase.from("organizations").select("id,name,slug,active,created_at,branches(id)").order("created_at", { ascending: false }) : { data: [] };
  const sessionResponse = supabase ? await supabase.from("impersonation_sessions").select("id,organization_id,reason,started_at,ended_at,organizations(name)").order("started_at", { ascending: false }).limit(20) : { data: [] };
  const organizations = organizationResponse.data ?? [];
  const sessions = sessionResponse.data ?? [];
  const params = (await searchParams) ?? {};
  return <div className="space-y-4">
    <PageHeader eyebrow="Plataforma" title="Organizaciones" description="Soporte y control de cuentas SaaS." />
    <PageNotice searchParams={params} />
    <section className="surface rounded-[1rem] p-5">
      <h2 className="text-lg font-semibold">Soporte activo</h2>
      <form action={endImpersonationAction} className="mt-3"><SubmitButton className="btn-secondary" label="Finalizar soporte" pendingLabel="Finalizando..." /></form>
    </section>
    <section className="surface overflow-hidden rounded-[1rem]">
      <div className="border-b border-stone-200 p-5"><h2 className="text-lg font-semibold">Clientes SaaS</h2></div>
      <div className="divide-y divide-stone-100">
        {(organizations ?? []).map((organization) => <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between" key={organization.id}>
          <div><p className="font-semibold">{organization.name}</p><p className="text-sm text-stone-600">{organization.slug} · {(organization.branches ?? []).length} sucursal(es)</p></div>
          <form action={startImpersonationAction} className="flex flex-wrap gap-2"><input name="organizationId" type="hidden" value={organization.id} /><input className="input-base !py-2" name="reason" placeholder="Motivo de soporte" required /><SubmitButton className="btn-secondary" label="Iniciar soporte" pendingLabel="Iniciando..." /></form>
        </div>)}
      </div>
    </section>
    <section className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Historial de soporte</h2><div className="mt-4 space-y-2 text-sm text-stone-700">{(sessions ?? []).map((session) => <p key={session.id}>{String((Array.isArray(session.organizations) ? session.organizations[0] : session.organizations)?.name ?? "Organización")} · {session.reason || "Sin motivo"} · {session.ended_at ? "Finalizado" : "Activo"}</p>)}</div></section>
  </div>;
}
