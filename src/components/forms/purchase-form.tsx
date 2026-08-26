"use client";

import { useState } from "react";

import type { Product } from "@/lib/types";

import { SubmitButton } from "./submit-button";

interface PurchaseFormProps {
  action: (formData: FormData) => void | Promise<void>;
  products: Product[];
}

export function PurchaseForm({ action, products }: PurchaseFormProps) {
  const [items, setItems] = useState([
    {
      productId: products[0]?.id ?? "",
      quantity: 1,
      unitCost: products[0]?.cost ?? 0,
    },
  ]);

  if (!products.length) {
    return (
      <section className="surface rounded-[1rem] p-5">
        <p className="label">Compras</p>
        <h3 className="mt-1 text-xl font-semibold">Crea productos primero</h3>
        <p className="mt-2 text-sm text-stone-600">Luego podras ingresar stock.</p>
      </section>
    );
  }

  function updateItem(index: number, field: string, value: string | number) {
    setItems((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) {
          return item;
        }

        if (field === "productId") {
          const product = products.find((entry) => entry.id === value);
          return {
            ...item,
            productId: String(value),
            unitCost: product?.cost ?? item.unitCost,
          };
        }

        return { ...item, [field]: value };
      }),
    );
  }

  return (
    <form action={action} className="surface rounded-[1.8rem] p-5">
      <p className="label">Nueva compra</p>
      <h3 className="mt-1 text-2xl font-semibold">Nueva compra</h3>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="label">Proveedor</label>
          <input className="input-base" name="supplier" placeholder="Proveedor" required />
        </div>
        <div className="space-y-2">
          <label className="label">Categoria</label>
          <input className="input-base" name="categoryName" placeholder="Categoria" required />
        </div>
        <div className="space-y-2 md:col-span-2">
          <label className="label">Fecha de compra</label>
          <input
            className="input-base"
            defaultValue={new Date().toISOString().slice(0, 16)}
            name="purchasedAt"
            required
            type="datetime-local"
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <p className="label">Items</p>
          <button
            className="btn-secondary !px-4 !py-2 text-sm"
            onClick={() =>
              setItems((current) => [
                ...current,
                {
                  productId: products[0]?.id ?? "",
                  quantity: 1,
                  unitCost: products[0]?.cost ?? 0,
                },
              ])
            }
            type="button"
          >
            Agregar
          </button>
        </div>

        {items.map((item, index) => (
          <div key={`${item.productId}-${index}`} className="surface-muted rounded-[1.5rem] p-4">
            <div className="grid gap-3 md:grid-cols-[1.4fr_0.7fr_0.8fr_auto]">
              <select
                className="select-base"
                onChange={(event) => updateItem(index, "productId", event.target.value)}
                value={item.productId}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <input
                className="input-base"
                min={1}
                onChange={(event) => updateItem(index, "quantity", Number(event.target.value))}
                type="number"
                value={item.quantity}
              />
              <input
                className="input-base"
                min={0}
                onChange={(event) => updateItem(index, "unitCost", Number(event.target.value))}
                type="number"
                value={item.unitCost}
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
        ))}
      </div>

      <div className="mt-5 space-y-2">
        <label className="label">Notas</label>
        <textarea className="textarea-base min-h-24" name="notes" placeholder="Notas" />
      </div>

      <input name="purchaseItems" type="hidden" value={JSON.stringify(items)} />

      <div className="mt-6">
        <SubmitButton label="Registrar compra" pendingLabel="Registrando compra..." />
      </div>
    </form>
  );
}
