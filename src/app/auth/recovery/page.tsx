"use client";

import { useEffect, useState } from "react";

import { createBrowserClient } from "@supabase/ssr";
import { Scissors } from "lucide-react";

export default function AuthRecoveryPage() {
  const [message, setMessage] = useState("Validando acceso...");

  useEffect(() => {
    async function restoreRecoverySession() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      );

      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      const tokenHash = searchParams.get("token_hash");
      const token = searchParams.get("token");
      const email = searchParams.get("email");
      const authError = searchParams.get("error") ?? searchParams.get("error_code");

      if (authError) {
        setMessage("Link vencido. Pide uno nuevo.");
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessage("Link vencido. Pide uno nuevo.");
          return;
        }

        window.location.replace("/reset-password");
        return;
      }

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });

        if (error) {
          setMessage("Link vencido. Pide uno nuevo.");
          return;
        }

        window.location.replace("/reset-password");
        return;
      }

      if (token && email) {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "recovery",
        });

        if (error) {
          setMessage("Link vencido. Pide uno nuevo.");
          return;
        }

        window.location.replace("/reset-password");
        return;
      }

      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (!accessToken || !refreshToken) {
        setMessage("Abre el link completo desde el correo.");
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        setMessage("Link vencido. Pide uno nuevo.");
        return;
      }

      window.location.replace("/reset-password");
    }

    void restoreRecoverySession();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10 text-stone-900">
      <section className="w-full max-w-md surface rounded-[1rem] p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Scissors className="h-6 w-6" />
          </div>
          <div>
            <p className="label">Peluqueria</p>
            <h1 className="text-2xl font-semibold">Recuperar acceso</h1>
          </div>
        </div>

        <p className="mt-6 text-sm text-stone-600">{message}</p>
      </section>
    </main>
  );
}
