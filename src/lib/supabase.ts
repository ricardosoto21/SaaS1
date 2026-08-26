import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

class DisabledRealtimeTransport {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly readyState = 3;
  readonly url: string;
  readonly protocol = "";
  readonly bufferedAmount = 0;
  readonly extensions = "";
  binaryType = "arraybuffer";
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;

  constructor(address: string | URL) {
    this.url = String(address);
  }

  close() {}

  send() {
    throw new Error("Realtime no esta habilitado en esta aplicacion.");
  }

  addEventListener() {}

  removeEventListener() {}

  dispatchEvent() {
    return false;
  }
}

const serverClientOptions = {
  realtime: {
    transport: DisabledRealtimeTransport,
  },
};

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowserInfo() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  };
}

export async function getSupabaseServerClient() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...serverClientOptions,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof cookieStore.set>[2];
          }>,
        ) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can read cookies but cannot always write them.
          }
        },
      },
    },
  );
}

export function getSupabaseAdminClient() {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      ...serverClientOptions,
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
