"use client";

import { useState } from "react";

import { createPublicBookingHoldAction } from "@/app/reservar/[slug]/actions";
import { formatCurrency } from "@/lib/utils";

type Branch = { id: string; name: string };
type Professional = { id: string; name: string; branchIds: string[] };
type Service = { id: string; name: string; basePrice: number; durationMinutes: number };

export function PublicBookingForm({ slug, branches, professionals, services, error }: { slug: string; branches: Branch[]; professionals: Professional[]; services: Service[]; error: string }) {
  const [branchId, setBranchId] = useState("");
  const eligibleProfessionals = professionals.filter((professional) => !branchId || professional.branchIds.includes(branchId));
  return <form action={createPublicBookingHoldAction} className="rounded-2xl bg-white p-6 shadow-sm"><input name="slug" type="hidden" value={slug}/>{error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<div className="grid gap-4"><select className="input-base" name="branchId" required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select className="input-base" name="professionalId" required disabled={!branchId}><option value="">Profesional</option>{eligibleProfessionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select><input className="input-base" name="startAt" type="datetime-local" required/><fieldset className="space-y-2"><legend className="font-medium">Servicios</legend>{services.map((service) => <label className="flex items-center justify-between rounded-lg border border-stone-200 p-3" key={service.id}><span><input className="mr-2" name="serviceId" type="checkbox" value={service.id}/>{service.name}</span><span className="text-sm text-stone-600">{formatCurrency(service.basePrice)} · {service.durationMinutes} min</span></label>)}</fieldset><input className="input-base" name="clientName" placeholder="Nombre" required/><input className="input-base" name="clientPhone" placeholder="Teléfono" required/><input className="input-base" name="clientEmail" placeholder="Email" type="email"/><button className="btn-primary" type="submit">Reservar y pagar anticipo</button></div></form>;
}