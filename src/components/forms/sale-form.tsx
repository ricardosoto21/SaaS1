"use client";

import { useState } from "react";

import type { Client, Product, Professional, Service } from "@/lib/types";

import { SubmitButton } from "./submit-button";

interface SaleFormProps {
  action: (formData: FormData) => void | Promise<void>;
  clients: Client[];
  professionals: Professional[];
  services: Service[];
  products: Product[];
}

type DraftItem = {
  type: "service" | "product";
  referenceId: string;
  quantity: number;
  unitPrice: number;
};

export function SaleForm({ action, clients, professionals, services, products }: SaleFormProps) {
  const defaultType: DraftItem["type"] = services.length ? "service" : "product";
  const hasCatalog = services.length > 0 || products.length > 0;
  const missing = [
    clients.length === 0 ? "clientes" : "",
    professionals.length === 0 ? "profesionales" : "",
    !hasCatalog ? "servicios o productos" : "",
  ].filter(Boolean);

  const [productQuery, setProductQuery] = useState("");
  const [items, setItems] = useState<DraftItem[]>([
    {
      type: defaultType,
      referenceId: defaultType === "service" ? services[0]?.id ?? "" : products[0]?.id ?? "",
      quantity: 1,
      unitPrice: defaultType === "service" ? services[0]?.basePrice ?? 0 : products[0]?.salePrice ?? 0,
    },
  ]);

  function addProductByQuery() {
    const needle = productQuery.trim().toLowerCase();
    const product = products.find((item) => item.name.toLowerCase() === needle || item.sku.toLowerCase() === needle || item.barcode?.toLowerCase() === needle);
    if (!product) return;
    setItems((current) => [...current, { type: "product", referenceId: product.id, quantity: 1, unitPrice: product.salePrice }]);
    setProductQuery("");
  }
  if (missing.length) {
    return (
      <section className="surface rounded-[1rem] p-5">
        <p className="label">Venta</p>
        <h3 className="mt-1 text-xl font-semibold">Faltan {missing.join(", ")}</h3>
        <p className="mt-2 text-sm text-stone-600">Crea esos datos antes de vender.</p>
      </section>
    );
  }

  function syncLine(index: number, field: keyof DraftItem, value: string | number) {
    setItems((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        if (field === "type") {
          const nextType = value as DraftItem["type"];
          const defaultReference = nextType === "service" ? services[0]?.id ?? "" : products[0]?.id ?? "";
          const defaultPrice =
            nextType === "service" ? services[0]?.basePrice ?? 0 : products[0]?.salePrice ?? 0;

          return {
            type: nextType,
            referenceId: defaultReference,
            quantity: 1,
            unitPrice: defaultPrice,
          };
        }

        if (field === "referenceId") {
          const catalog = item.type === "service" ? services : products;
          const selected = catalog.find((entry) => entry.id === value);
          return {
            ...item,
            referenceId: String(value),
            unitPrice:
              item.type === "service"
                ? (selected as Service | undefined)?.basePrice ?? item.unitPrice
                : (selected as Product | undefined)?.salePrice ?? item.unitPrice,
          };
        }

        return { ...item, [field]: value };
      }),
    );
  }

  return (
    <form action={action} className="surface rounded-[1.8rem] p-5">
      <p className="label">Venta manual</p>
      <h3 className="mt-1 text-2xl font-semibold">Nueva venta</h3>

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
          <select className="select-base" name="professionalId" required>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="label">Fecha de venta</label>
          <input
            className="input-base"
            defaultValue={new Date().toISOString().slice(0, 16)}
            name="soldAt"
            required
            type="datetime-local"
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white/60 p-4"><p className="label">Agregar por código</p><div className="mt-2 flex gap-2"><input className="input-base" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addProductByQuery(); } }} placeholder="Nombre, SKU o código de barras"/><button className="btn-secondary" onClick={addProductByQuery} type="button">Agregar</button></div></div>
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="label">Items</p>
          <button
            className="btn-secondary !px-4 !py-2 text-sm"
            onClick={() =>
              setItems((current) => [
                ...current,
                {
                  type: products.length ? "product" : "service",
                  referenceId: products.length ? products[0]?.id ?? "" : services[0]?.id ?? "",
                  quantity: 1,
                  unitPrice: products.length ? products[0]?.salePrice ?? 0 : services[0]?.basePrice ?? 0,
                },
              ])
            }
            type="button"
          >
            Agregar
          </button>
        </div>

        {items.map((item, index) => {
          const catalog = item.type === "service" ? services : products;
          return (
            <div key={`${item.type}-${index}`} className="surface-muted rounded-[1.5rem] p-4">
              <div className="grid gap-3 md:grid-cols-[0.8fr_1.4fr_0.7fr_0.8fr_auto]">
                <select
                  className="select-base"
                  onChange={(event) => syncLine(index, "type", event.target.value)}
                  value={item.type}
                >
                  <option value="service">Servicio</option>
                  <option value="product">Producto</option>
                </select>

                <select
                  className="select-base"
                  onChange={(event) => syncLine(index, "referenceId", event.target.value)}
                  value={item.referenceId}
                >
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>

                <input
                  className="input-base"
                  min={1}
                  onChange={(event) => syncLine(index, "quantity", Number(event.target.value))}
                  type="number"
                  value={item.quantity}
                />

                <input
                  className="input-base"
                  min={0}
                  onChange={(event) => syncLine(index, "unitPrice", Number(event.target.value))}
                  type="number"
                  value={item.unitPrice}
                />

                <button
                  className="btn-secondary !px-4 !py-2 text-sm"
                  disabled={items.length === 1}
                  onClick={() => setItems((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                  type="button"
                >
                  Quitar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="label">Abono inicial</label>
          <input className="input-base" min={0} name="initialPaymentAmount" placeholder="0" type="number" />
        </div>

        <div className="space-y-2">
          <label className="label">Medio de pago</label>
          <select className="select-base" name="initialPaymentMethod">
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="card">Tarjeta</option>
            <option value="mercado_pago">Mercado Pago</option>
            <option value="other">Otro</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="label">Nota del abono</label>
          <input className="input-base" name="initialPaymentNote" placeholder="Ej: reserva" />
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <label className="label">Notas</label>
        <textarea className="textarea-base min-h-24" name="notes" placeholder="Notas" />
      </div>

      <input name="saleItems" type="hidden" value={JSON.stringify(items)} />

      <div className="mt-6">
        <SubmitButton label="Registrar venta" pendingLabel="Registrando venta..." />
      </div>
    </form>
  );
}
