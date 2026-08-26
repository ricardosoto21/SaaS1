import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabase";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? {
      error: new Error("Supabase no configurado."),
    };

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=session", requestUrl.origin));
}
