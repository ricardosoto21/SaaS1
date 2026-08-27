import { redirect } from "next/navigation";

import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import { endImpersonationAction, setOrganizationActiveAction, setOrganizationSubscriptionAction, startImpersonationAction, updateSubscriptionPlanAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  if (user.role !== "super_admin") redirect("/dashboard");
  const supabase = await getSupabaseServerClient();
  const [organizationResponse, planResponse, subscriptionResponse, sessionResponse] = await Promise.all([
    supabase ? supabase.from("organizations").select("id,name,slug,active,created_at,branches(id)").order("created_at", { ascending: false }) : { data: [] },
    supabase ? supabase.from("subscription_plans").select("id,name,monthly_price,active").order("monthly_price") : { data: [] },
    supabase ? supabase.from("organization_subscriptions").select("organization_id,plan_id,status,current_period_end") : { data: [] },
    supabase ? supabase.from("impersonation_sessions").select("id,organization_id,reason,started_at,ended_at,organizations(name)").order("started_at", { ascending: false }).limit(20) : { data: [] },
  ]);
  const organizations = organizationResponse.data ?? [];
  const plans = planResponse.data ?? [];
  const subscriptions = new Map((subscriptionResponse.data ?? []).map((item) => [String(item.organization_id), item]));
  const sessions = sessionResponse.data ?? [];
  const params = (await searchParams) ?? {};

  return <div className="space-y-4">
    <PageHeader eyebrow="Plataforma" title="Organizaciones" description="Soporte, planes y estado de cuentas SaaS." />
    <PageNotice searchParams={params} />
    <section className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Soporte activo</h2><form action={endImpersonationAction} className="mt-3"><SubmitButton className="btn-secondary" label="Finalizar soporte" pendingLabel="Finalizando..." /></form></section>
    <section className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Planes SaaS</h2><div className="mt-4 grid gap-3">{plans.map((plan) => <form action={updateSubscriptionPlanAction} className="grid gap-2 md:grid-cols-[1fr_180px_140px_auto]" key={plan.id}><input name="planId" type="hidden" value={plan.id}/><p className="self-center font-medium">{plan.name}</p><input className="input-base" defaultValue={plan.monthly_price} min={1} name="monthlyPrice" type="number"/><select className="select-base" defaultValue={plan.active ? "true" : "false"} name="active"><option value="true">Activo</option><option value="false">Inactivo</option></select><SubmitButton className="btn-secondary" label="Guardar" pendingLabel="Guardando..."/></form>)}</div></section>
    <section className="surface overflow-hidden rounded-[1rem]"><div className="border-b border-stone-200 p-5"><h2 className="text-lg font-semibold">Clientes SaaS</h2></div><div className="divide-y divide-stone-100">
      {organizations.map((organization) => {
        const subscription = subscriptions.get(String(organization.id));
        return <div className="flex flex-col gap-4 p-5" key={organization.id}>
          <div><p className="font-semibold">{organization.name}</p><p className="text-sm text-stone-600">{organization.slug} · {(organization.branches ?? []).length} sucursal(es) · {organization.active ? "Activa" : "Inactiva"}</p></div>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <form action={setOrganizationSubscriptionAction} className="flex flex-wrap gap-2"><input name="organizationId" type="hidden" value={organization.id} /><select className="select-base !py-2" name="planId" defaultValue={subscription?.plan_id}>{plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · ${Number(plan.monthly_price).toLocaleString("es-CL")}</option>)}</select><select className="select-base !py-2" name="status" defaultValue={subscription?.status ?? "trialing"}><option value="trialing">Trial</option><option value="active">Activa</option><option value="past_due">Vencida</option><option value="suspended">Suspendida</option><option value="cancelled">Cancelada</option></select><input className="input-base !py-2" name="periodEnd" required type="date" defaultValue={subscription?.current_period_end?.slice(0, 10) ?? ""}/><SubmitButton className="btn-secondary" label="Guardar plan" pendingLabel="Guardando..." /></form>
            <form action={startImpersonationAction} className="flex flex-wrap gap-2"><input name="organizationId" type="hidden" value={organization.id} /><input className="input-base !py-2" name="reason" placeholder="Motivo de soporte" required /><SubmitButton className="btn-secondary" label="Iniciar soporte" pendingLabel="Iniciando..." /></form>
            <form action={setOrganizationActiveAction}><input name="organizationId" type="hidden" value={organization.id}/><input name="active" type="hidden" value={organization.active ? "false" : "true"}/><SubmitButton className="btn-secondary" label={organization.active ? "Desactivar" : "Activar"} pendingLabel="Guardando..."/></form>
          </div>
        </div>;
      })}
    </div></section>
    <section className="surface rounded-[1rem] p-5"><h2 className="text-lg font-semibold">Historial de soporte</h2><div className="mt-4 space-y-2 text-sm text-stone-700">{sessions.map((session) => <p key={session.id}>{String((Array.isArray(session.organizations) ? session.organizations[0] : session.organizations)?.name ?? "Organización")} · {session.reason || "Sin motivo"} · {session.ended_at ? "Finalizado" : "Activo"}</p>)}</div></section>
  </div>;
}
