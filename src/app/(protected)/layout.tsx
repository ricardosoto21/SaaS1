import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireSession();

  if (!user) {
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}

