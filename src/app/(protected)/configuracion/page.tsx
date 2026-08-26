import { PackagePlus, Scissors, Settings, UserCog, UserPlus } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/empty-state";
import { SubmitButton } from "@/components/forms/submit-button";
import { PageHeader } from "@/components/page-header";
import { PageNotice } from "@/components/page-notice";
import {
  createProductAction,
  createProfessionalAction,
  createServiceAction,
  createUserAction,
  resetUserAccessAction,
  updateProfessionalStatusAction,
  updateProfileAction,
  updateSettingsAction,
} from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { roleCanAccess } from "@/lib/data";
import { readStore } from "@/lib/store";
import { shouldUseSupabaseStore } from "@/lib/supabase-store";

export const dynamic = "force-dynamic";

interface ConfiguracionPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConfiguracionPage({ searchParams }: ConfiguracionPageProps) {
  const user = await requireSession();
  if (!roleCanAccess(user.role, "/configuracion")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const params = (await searchParams) ?? {};
  const usesSupabase = shouldUseSupabaseStore();

  return (
    <div className="space-y-4">
      <PageHeader description="Ajustes y catalogos." eyebrow="Configuracion" title="Base del negocio" />
      <PageNotice searchParams={params} />

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="surface rounded-[1rem] p-5">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-teal-700" />
            <div>
              <p className="label">Ajustes</p>
              <h2 className="mt-1 text-xl font-semibold">Negocio</h2>
            </div>
          </div>
          <form action={updateSettingsAction} className="mt-5 space-y-4">
            <input className="input-base" defaultValue={store.settings.salonName} name="salonName" placeholder="Nombre" />
            <input className="input-base" defaultValue={store.settings.businessName} name="businessName" placeholder="Razon social" />
            <input className="input-base" defaultValue={store.settings.lowStockThreshold} min={1} name="lowStockThreshold" type="number" />
            <SubmitButton label="Guardar" pendingLabel="Guardando..." />
          </form>
        </article>

        <article className="surface rounded-[1rem] p-5">
          <div className="flex items-center gap-3">
            <UserCog className="h-5 w-5 text-indigo-700" />
            <div>
              <p className="label">Equipo</p>
              <h2 className="mt-1 text-xl font-semibold">Profesional</h2>
            </div>
          </div>
          <form action={createProfessionalAction} className="mt-5 space-y-4">
            <input className="input-base" name="name" placeholder="Nombre" required />
            <input className="input-base" name="specialty" placeholder="Especialidad" required />
            <input className="input-base" defaultValue="#0f766e" name="color" type="color" />
            <SubmitButton label="Crear profesional" pendingLabel="Guardando..." />
          </form>

          <div className="mt-5 space-y-3">
            {store.professionals.length ? (
              store.professionals.map((professional) => (
                <form
                  key={professional.id}
                  action={updateProfessionalStatusAction}
                  className="surface-muted flex flex-col gap-3 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <input name="professionalId" type="hidden" value={professional.id} />
                  <input name="active" type="hidden" value={professional.active ? "false" : "true"} />
                  <div>
                    <p className="font-semibold">{professional.name}</p>
                    <p className="text-sm text-stone-600">{professional.active ? "Activo" : "Inactivo"}</p>
                  </div>
                  <button className="btn-secondary !py-2" type="submit">
                    {professional.active ? "Desactivar" : "Activar"}
                  </button>
                </form>
              ))
            ) : null}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="surface rounded-[1rem] p-5">
          <div className="flex items-center gap-3">
            <UserPlus className="h-5 w-5 text-teal-700" />
            <div>
              <p className="label">Usuarios</p>
              <h2 className="mt-1 text-xl font-semibold">{usesSupabase ? "Invitar usuario" : "Nuevo usuario"}</h2>
            </div>
          </div>
          <form action={createUserAction} className="mt-5 space-y-4">
            <input className="input-base" name="name" placeholder="Nombre" required />
            <input className="input-base" name="email" placeholder="Email" required type="email" />
            {usesSupabase ? null : (
              <input className="input-base" minLength={8} name="password" placeholder="Clave temporal" required type="password" />
            )}
            <select className="select-base" name="role" required>
              <option value="recepcion">Recepcion</option>
              <option value="estilista">Estilista</option>
              <option value="admin">Admin</option>
            </select>
            <select className="select-base" name="professionalId">
              <option value="">Sin profesional vinculado</option>
              {store.professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
            <SubmitButton label={usesSupabase ? "Enviar invitacion" : "Crear usuario"} pendingLabel="Guardando..." />
          </form>
        </article>

        <article className="surface rounded-[1rem] p-5">
          <p className="label">Accesos</p>
          <h2 className="mt-1 text-xl font-semibold">Usuarios</h2>
          <div className="mt-5 space-y-3">
            {store.profiles.length ? (
              store.profiles.map((profile) => (
                <section key={profile.id} className="surface-muted rounded-xl p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="font-semibold">{profile.name}</p>
                      <p className="text-sm text-stone-600">
                        {profile.email} - {profile.active === false ? "Inactivo" : "Activo"}
                      </p>
                    </div>
                    <form action={resetUserAccessAction}>
                      <input name="email" type="hidden" value={profile.email} />
                      <button className="btn-secondary !py-2" type="submit">
                        Reset acceso
                      </button>
                    </form>
                  </div>
                  <form action={updateProfileAction} className="mt-4 grid gap-3 md:grid-cols-4">
                    <input name="profileId" type="hidden" value={profile.id} />
                    <select className="select-base" defaultValue={profile.role} name="role">
                      <option value="admin">Admin</option>
                      <option value="recepcion">Recepcion</option>
                      <option value="estilista">Estilista</option>
                    </select>
                    <select className="select-base" defaultValue={profile.professionalId ?? ""} name="professionalId">
                      <option value="">Sin profesional</option>
                      {store.professionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.name}
                        </option>
                      ))}
                    </select>
                    <select className="select-base" defaultValue={profile.active === false ? "false" : "true"} name="active">
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                    <SubmitButton className="btn-secondary" label="Guardar" pendingLabel="Guardando..." />
                  </form>
                </section>
              ))
            ) : (
              <EmptyState description="Sin usuarios." title="Vacio" />
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="surface rounded-[1rem] p-5">
          <div className="flex items-center gap-3">
            <Scissors className="h-5 w-5 text-orange-700" />
            <div>
              <p className="label">Servicios</p>
              <h2 className="mt-1 text-xl font-semibold">Nuevo servicio</h2>
            </div>
          </div>
          <form action={createServiceAction} className="mt-5 space-y-4">
            <input className="input-base" name="name" placeholder="Nombre" required />
            <input className="input-base" name="categoryName" placeholder="Categoria" required />
            <input className="input-base" min={15} name="durationMinutes" placeholder="Minutos" required type="number" />
            <input className="input-base" min={0} name="basePrice" placeholder="Precio base" required type="number" />
            <SubmitButton label="Crear servicio" pendingLabel="Guardando..." />
          </form>
        </article>

        <article className="surface rounded-[1rem] p-5">
          <div className="flex items-center gap-3">
            <PackagePlus className="h-5 w-5 text-emerald-700" />
            <div>
              <p className="label">Productos</p>
              <h2 className="mt-1 text-xl font-semibold">Nuevo producto</h2>
            </div>
          </div>
          <form action={createProductAction} className="mt-5 space-y-4">
            <input className="input-base" name="name" placeholder="Nombre" required />
            <input className="input-base" name="categoryName" placeholder="Categoria" required />
            <input className="input-base" name="sku" placeholder="SKU" required />
            <input className="input-base" min={0} name="cost" placeholder="Costo" required type="number" />
            <input className="input-base" min={0} name="salePrice" placeholder="Precio venta" required type="number" />
            <input className="input-base" min={0} name="currentStock" placeholder="Stock inicial" required type="number" />
            <SubmitButton label="Crear producto" pendingLabel="Guardando..." />
          </form>
        </article>
      </section>

      <article className="surface rounded-[1rem] p-5">
        <p className="label">Catalogos</p>
        <h2 className="mt-1 text-xl font-semibold">Categorias creadas</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            ["Servicios", store.serviceCategories],
            ["Productos", store.productCategories],
            ["Gastos", store.expenseCategories],
          ].map(([title, categories]) => (
            <div key={title as string} className="surface-muted rounded-[0.75rem] p-4">
              <p className="font-semibold">{title as string}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(categories as typeof store.serviceCategories).length ? (
                  (categories as typeof store.serviceCategories).map((category) => (
                    <span key={category.id} className="rounded-full bg-white/80 px-3 py-1 text-sm">
                      {category.name}
                    </span>
                  ))
                ) : (
                  <EmptyState description="Sin datos." title="Vacio" />
                )}
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
