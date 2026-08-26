"use client";

import { useState } from "react";

import type { Client, Professional, Service } from "@/lib/types";

import { SubmitButton } from "./submit-button";

interface AppointmentFormProps {
  action: (formData: FormData) => void | Promise<void>;
  clients: Client[];
  defaultProfessionalId?: string;
  defaultStartAt?: string;
  professionals: Professional[];
  services: Service[];
  submitLabel?: string;
  title?: string;
}

export function AppointmentForm({
  action,
  clients,
  defaultProfessionalId,
  defaultStartAt,
  professionals,
  services,
  submitLabel = "Crear cita",
  title = "Nueva cita",
}: AppointmentFormProps) {
  const missing = [
    clients.length === 0 ? "clientes" : "",
    professionals.length === 0 ? "profesionales" : "",
    services.length === 0 ? "servicios" : "",
  ].filter(Boolean);

  const [lines, setLines] = useState([
    {
      serviceId: services[0]?.id ?? "",
      price: services[0]?.basePrice ?? 0,
      durationMinutes: services[0]?.durationMinutes ?? 60,
      notes: "",
    },
  ]);

  if (missing.length) {
    return (
      <section className="surface rounded-[1rem] p-5">
        <p className="label">Nueva cita</p>
        <h3 className="mt-1 text-xl font-semibold">Faltan {missing.join(", ")}</h3>
        <p className="mt-2 text-sm text-stone-600">Crea esos datos antes de agendar.</p>
      </section>
    );
  }

  function updateLine(index: number, field: string, value: string | number) {
    setLines((current) =>
      current.map((line, currentIndex) => {
        if (currentIndex !== index) {
          return line;
        }

        if (field === "serviceId") {
          const service = services.find((item) => item.id === value);
          return {
            ...line,
            serviceId: String(value),
            price: service?.basePrice ?? line.price,
            durationMinutes: service?.durationMinutes ?? line.durationMinutes,
          };
        }

        return { ...line, [field]: value };
      }),
    );
  }

  return (
    <form action={action} className="surface rounded-[1.8rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">Nueva cita</p>
          <h3 className="mt-1 text-2xl font-semibold">{title}</h3>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="label">Cliente</label>
          <select className="select-base" name="clientId" required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="label">Profesional</label>
          <select className="select-base" defaultValue={defaultProfessionalId} name="professionalId" required>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="label">Fecha y hora</label>
          <input
            className="input-base"
            defaultValue={defaultStartAt ?? new Date().toISOString().slice(0, 16)}
            name="startAt"
            required
            type="datetime-local"
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="label">Servicios</p>
          <button
            className="btn-secondary !px-4 !py-2 text-sm"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  serviceId: services[0]?.id ?? "",
                  price: services[0]?.basePrice ?? 0,
                  durationMinutes: services[0]?.durationMinutes ?? 60,
                  notes: "",
                },
              ])
            }
            type="button"
          >
            Agregar
          </button>
        </div>

        {lines.map((line, index) => (
          <div key={`${line.serviceId}-${index}`} className="surface-muted rounded-[1.5rem] p-4">
            <div className="grid gap-3 md:grid-cols-[1.5fr_0.8fr_0.8fr_auto]">
              <select
                className="select-base"
                onChange={(event) => updateLine(index, "serviceId", event.target.value)}
                value={line.serviceId}
              >
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <input
                className="input-base"
                min={0}
                onChange={(event) => updateLine(index, "price", Number(event.target.value))}
                type="number"
                value={line.price}
              />
              <input
                className="input-base"
                min={15}
                onChange={(event) => updateLine(index, "durationMinutes", Number(event.target.value))}
                type="number"
                value={line.durationMinutes}
              />
              <button
                className="btn-secondary !px-4 !py-2 text-sm"
                disabled={lines.length === 1}
                onClick={() => setLines((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                type="button"
              >
                Quitar
              </button>
            </div>
            <textarea
              className="textarea-base mt-3 min-h-20"
              onChange={(event) => updateLine(index, "notes", event.target.value)}
              placeholder="Nota del servicio"
              value={line.notes}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        <label className="label">Notas</label>
        <textarea className="textarea-base min-h-24" name="notes" placeholder="Notas" />
      </div>

      <input name="serviceLines" type="hidden" value={JSON.stringify(lines)} />

      <div className="mt-6">
        <SubmitButton label={submitLabel} pendingLabel="Creando cita..." />
      </div>
    </form>
  );
}
