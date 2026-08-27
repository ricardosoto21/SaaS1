"use client";

import { type FormEvent, useState, useTransition } from "react";

import { createBrowserClient } from "@supabase/ssr";

export function SupabaseLoginForm() {
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      );
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMessage("Email o clave incorrectos.");
        return;
      }

      window.location.assign("/dashboard");
    });
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      {message ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {message}
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="input-base" id="email" name="email" placeholder="tu@email.cl" required type="email" />
      </div>

      <div className="space-y-2">
        <label className="label" htmlFor="password">
          Clave
        </label>
        <input className="input-base" id="password" name="password" placeholder="Clave" required type="password" />
      </div>

      <button className="btn-primary w-full" disabled={isPending} type="submit">
        {isPending ? "Ingresando..." : "Entrar"}
      </button>
    </form>
  );
}
