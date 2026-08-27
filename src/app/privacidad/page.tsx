import Link from "next/link";
import { appBrand } from "@/lib/brand";

export const metadata = { title: "Privacidad" };

export default function PrivacyPage() {
  return <main className="min-h-screen bg-[#f5f2eb] px-4 py-12 text-stone-800"><article className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm"><Link className="text-sm font-semibold text-teal-700" href="/">{appBrand.appName}</Link><h1 className="mt-6 text-3xl font-semibold">Privacidad</h1><p className="mt-5">La plataforma procesa datos de usuarios, clientes y operaciones únicamente para prestar el servicio contratado. Cada salón controla los datos de sus clientes y define quién puede acceder a ellos.</p><h2 className="mt-7 text-xl font-semibold">Seguridad</h2><p className="mt-3">El acceso se protege mediante autenticación, roles y aislamiento por organización y sucursal. Las credenciales de proveedores se mantienen fuera del navegador y se cifran cuando corresponde.</p><h2 className="mt-7 text-xl font-semibold">Contacto</h2><p className="mt-3">Para solicitudes relacionadas con privacidad escribe a {appBrand.supportEmail}.</p></article></main>;
}
