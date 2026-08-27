import Link from "next/link";

import {
  CalendarRange,
  LayoutDashboard,
  Receipt,
  Scissors,
  Settings,
  ShoppingBag,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { setActiveBranchAction } from "@/lib/actions";
import { signOutAction } from "@/lib/auth";
import { navItems } from "@/lib/data";
import type { Role, SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

const iconByPath: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/agenda": CalendarRange,
  "/clientes": Sparkles,
  "/ventas": Wallet,
  "/inventario": ShoppingBag,
  "/compras": Receipt,
  "/gastos": Receipt,
  "/configuracion": Settings,
} as const;

const roleLabel: Record<Role, string> = {
  super_admin: "Plataforma",
  admin: "Admin",
  recepcion: "Recepcion",
  estilista: "Estilista",
};

export function AppShell({ children, user, branches }: { children: React.ReactNode; user: SessionUser; branches: Array<{ id: string; name: string }> }) {
  const items = navItems.filter((item) => item.roles.includes(user.role));

  return (
    <div className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="surface rounded-[1rem] p-5 lg:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
              <Scissors className="h-6 w-6" />
            </div>
            <div>
              <p className="label">Peluqueria</p>
              <h1 className="text-xl font-semibold">Gestion</h1>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-white/40 bg-stone-900/[0.04] p-4">
            <p className="label">Sesion</p>
            <p className="mt-2 text-lg font-semibold">{user.name}</p>
            <p className="text-sm text-stone-600">{roleLabel[user.role]}</p>
          </div>
          <form action={setActiveBranchAction} className="mt-3">
            <label className="label" htmlFor="branchId">Sucursal</label>
            <select className="input-base mt-1 w-full" defaultValue={user.branchId} id="branchId" name="branchId">
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {branches.length > 1 ? <button className="btn-secondary mt-2 w-full" type="submit">Cambiar sucursal</button> : null}
          </form>

          <nav className="mt-8 space-y-2">
            {items.map((item) => {
              const Icon = iconByPath[item.href];
              return (
                <Link
                  key={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-stone-700 transition hover:bg-white/70 hover:text-stone-950",
                    "border border-transparent",
                  )}
                  href={item.href}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <form action={signOutAction} className="mt-8">
            <button className="btn-secondary w-full" type="submit">
              Cerrar sesion
            </button>
          </form>
        </aside>

        <div>
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
