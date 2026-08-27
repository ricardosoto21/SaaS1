import Link from "next/link";
import { appBrand } from "@/lib/brand";

export const metadata = { title: "Términos de servicio" };

export default function TermsPage() {
  return <main className="min-h-screen bg-[#f5f2eb] px-4 py-12 text-stone-800"><article className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm"><Link className="text-sm font-semibold text-teal-700" href="/">{appBrand.appName}</Link><h1 className="mt-6 text-3xl font-semibold">Términos de servicio</h1><p className="mt-5">La plataforma permite administrar operaciones de salones. Cada organización es responsable de la exactitud de sus datos, de los permisos entregados a su equipo y del cumplimiento de sus obligaciones tributarias.</p><h2 className="mt-7 text-xl font-semibold">Suscripción y datos</h2><p className="mt-3">El acceso depende de una suscripción vigente. Tras una cancelación, los datos se conservan durante el período informado antes de su eliminación programada. El administrador puede exportar información durante ese plazo.</p><h2 className="mt-7 text-xl font-semibold">Soporte</h2><p className="mt-3">Para consultas de servicio escribe a {appBrand.supportEmail}.</p></article></main>;
}
