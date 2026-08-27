import Link from "next/link";

import { appBrand } from "@/lib/brand";

import { registerSalonAction } from "./actions";

export default async function RegisterPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {}; const error = typeof params.error === "string" ? params.error : "";
  return <main className="min-h-screen bg-[#f5f2eb] px-4 py-12"><div className="mx-auto max-w-md"><Link className="text-sm font-semibold text-teal-800" href="/">{appBrand.appName}</Link><section className="mt-5 rounded-2xl bg-white p-7 shadow-sm"><p className="label">Crear cuenta</p><h1 className="mt-2 text-3xl font-semibold">Crea tu salón</h1><p className="mt-2 text-sm text-stone-600">Te enviaremos un correo para definir tu contraseña.</p>{error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<form action={registerSalonAction} className="mt-6 space-y-3"><input className="input-base" name="name" placeholder="Tu nombre" required/><input className="input-base" name="email" placeholder="Email" required type="email"/><input className="input-base" name="salonName" placeholder="Nombre del salón" required/><input className="input-base" defaultValue="Sucursal principal" name="branchName" required/><button className="btn-primary w-full" type="submit">Crear salón</button></form></section></div></main>;
}