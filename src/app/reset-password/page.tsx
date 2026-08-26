"use client";

import { type FormEvent, useState, useTransition } from "react";

import { createBrowserClient } from "@supabase/ssr";
import { Scissors } from "lucide-react";

export default function ResetPasswordPage() {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setMessage("Usa al menos 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Las claves no coinciden.");
      return;
    }

    startTransition(async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      );

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setMessage("Link vencido. Genera uno nuevo.");
        return;
      }

      await supabase.auth.signOut();
      window.location.replace("/login?reset=updated");
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10 text-stone-900">
      <section className="w-full max-w-md surface rounded-[1rem] p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Scissors className="h-6 w-6" />
          </div>
          <div>
            <p className="label">Peluqueria</p>
            <h1 className="text-2xl font-semibold">Nueva clave</h1>
          </div>
        </div>

        {message ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {message}
          </div>
        ) : null}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="label" htmlFor="password">
              Clave
            </label>
            <input className="input-base" id="password" name="password" required type="password" />
          </div>

          <div className="space-y-2">
            <label className="label" htmlFor="confirmPassword">
              Repetir clave
            </label>
            <input className="input-base" id="confirmPassword" name="confirmPassword" required type="password" />
          </div>

          <button className="btn-primary w-full" disabled={isPending} type="submit">
            {isPending ? "Guardando..." : "Guardar"}
          </button>
        </form>
      </section>
    </main>
  );
}
