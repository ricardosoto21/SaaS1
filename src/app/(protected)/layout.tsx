import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { getAccessibleBranches, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireSession();
  const branches = await getAccessibleBranches();

  if (!user) {
    redirect("/login");
  }

  return <AppShell branches={branches} user={user}>{children}</AppShell>;
}
