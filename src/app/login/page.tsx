import { Scissors } from "lucide-react";

import { requestPasswordResetAction, signInAction } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const hasError = params.error === "1" || params.error === "credentials";
  const isInactive = params.error === "inactive";
  const hasSessionError = params.error === "session";
  const resetSent = params.reset === "sent";
  const resetUpdated = params.reset === "updated";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10 text-stone-900">
      <section className="w-full max-w-md surface rounded-[1rem] p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Scissors className="h-6 w-6" />
          </div>
          <div>
            <p className="label">Peluqueria</p>
            <h1 className="text-2xl font-semibold">Ingresar</h1>
          </div>
        </div>

        {hasError || isInactive || hasSessionError ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {isInactive ? "Usuario inactivo." : hasSessionError ? "Link vencido. Pide uno nuevo." : "Email o clave incorrectos."}
          </div>
        ) : null}

        {resetSent || resetUpdated ? (
          <div className="mt-6 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
            {resetUpdated ? "Clave actualizada. Ingresa de nuevo." : "Revisa tu correo para cambiar la clave."}
          </div>
        ) : null}

        <form action={signInAction} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input className="input-base" id="email" name="email" placeholder="tu@email.cl" required />
          </div>

          <div className="space-y-2">
            <label className="label" htmlFor="password">
              Clave
            </label>
            <input className="input-base" id="password" name="password" placeholder="Clave" required type="password" />
          </div>

          <button className="btn-primary w-full" type="submit">
            Entrar
          </button>
        </form>

        <form action={requestPasswordResetAction} className="mt-4 space-y-3 border-t border-stone-200 pt-4">
          <p className="text-sm font-semibold text-stone-700">Recuperar acceso</p>
          <input className="input-base" name="email" placeholder="tu@email.cl" required type="email" />
          <button className="btn-secondary w-full" type="submit">
            Enviar link
          </button>
        </form>
      </section>
    </main>
  );
}
