import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

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

export async function proxy(request: NextRequest) {
  if (
    process.env.APP_DATA_MODE === "local" ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      realtime: {
        transport: DisabledRealtimeTransport,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof response.cookies.set>[2];
          }>,
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
