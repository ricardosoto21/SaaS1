import Link from "next/link";
import { redirect } from "next/navigation";

import { PageNotice } from "@/components/page-notice";
import { requestSubscriptionCancellationAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getSubscriptionAccess } from "@/lib/subscriptions/access";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  if (user.role === "super_admin") redirect("/super-admin");
  const access = await getSubscriptionAccess(user);
  const params = (await searchParams) ?? {};
  const isGrace = access.status === "past_due" && access.allowed;

  return <main className="min-h-screen bg-[#f5f2eb] px-4 py-12"><section className="mx-auto max-w-xl rounded-2xl bg-white p-7 shadow-sm"><p className="label">Suscripcion</p><h1 className="mt-2 text-3xl font-semibold">Estado de tu cuenta</h1><PageNotice searchParams={params} />
    {access.allowed ? <><p className="mt-4 text-stone-700">{isGrace ? "Tu cuenta esta en periodo de gracia. Regulariza el pago antes de la fecha limite para evitar el bloqueo." : "Tu suscripcion esta activa."}</p>{access.gracePeriodEnd ? <p className="mt-3 text-sm text-stone-600">Fecha limite: {formatDateTime(access.gracePeriodEnd)}</p> : null}<Link className="btn-primary mt-6" href="/dashboard">Volver al dashboard</Link>{user.role === "admin" ? <details className="mt-8 border-t border-stone-200 pt-5"><summary className="cursor-pointer text-sm font-semibold text-stone-700">Cancelar suscripcion</summary><form action={requestSubscriptionCancellationAction} className="mt-4 space-y-3"><textarea className="input-base min-h-24" name="reason" placeholder="Motivo opcional"/><button className="btn-secondary" type="submit">Solicitar cancelacion</button></form><p className="mt-3 text-xs text-stone-500">La solicitud programa la retencion de datos por 30 dias despues del fin de tu periodo.</p></details> : null}</> : <><p className="mt-4 text-stone-700">No puedes operar mientras la suscripcion este {access.status === "missing" ? "sin configurar" : "suspendida o vencida"}.</p>{access.gracePeriodEnd ? <p className="mt-3 text-sm text-stone-600">El periodo de gracia termino el {formatDateTime(access.gracePeriodEnd)}.</p> : null}<p className="mt-5 text-sm text-stone-600">Contacta a soporte para reactivar el servicio.</p>{user.role === "admin" ? <div className="mt-5 flex flex-wrap gap-2"><a className="btn-secondary" href="/api/exports/clients">Exportar clientes</a><a className="btn-secondary" href="/api/exports/sales">Exportar ventas</a><a className="btn-secondary" href="/api/exports/products">Exportar productos</a></div> : null}<a className="btn-primary mt-6" href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "soporte@salonsaas.cl"}`}>Contactar soporte</a></>}
  </section></main>;
}