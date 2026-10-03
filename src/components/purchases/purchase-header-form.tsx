"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, Loader2, Pencil, Save, TriangleAlert } from "lucide-react";

import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PurchaseFormOptions, PurchaseHeaderField } from "@/server/services/purchases";

import { createPurchaseAction, updatePurchaseHeaderAction } from "./purchase-actions";
import { formState, type PurchaseHeaderValues } from "./purchase-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

function HeaderFields({
  options,
  values,
  fieldErrors,
}: {
  options: PurchaseFormOptions;
  values: PurchaseHeaderValues;
  fieldErrors: Partial<Record<PurchaseHeaderField, string>>;
}) {
  const describedBy = (name: PurchaseHeaderField) =>
    fieldErrors[name] ? `${name}-error` : undefined;
  // Con una sola bodega no se pregunta.
  const singleWarehouse = options.warehouses.length === 1 ? options.warehouses[0] : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField name="supplierId" label="Proveedor" required error={fieldErrors.supplierId}>
        <select
          id="supplierId"
          name="supplierId"
          defaultValue={values.supplierId}
          required
          aria-invalid={fieldErrors.supplierId ? true : undefined}
          aria-describedby={describedBy("supplierId")}
          className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
        >
          <option value="">Elige un proveedor…</option>
          {options.suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.isArchived ? `${supplier.name} (archivado)` : supplier.name}
            </option>
          ))}
        </select>
      </FormField>

      {singleWarehouse && !fieldErrors.warehouseId ? (
        <input type="hidden" name="warehouseId" value={singleWarehouse.id} />
      ) : (
        <FormField name="warehouseId" label="Bodega" required error={fieldErrors.warehouseId}>
          <select
            id="warehouseId"
            name="warehouseId"
            defaultValue={values.warehouseId}
            required
            aria-invalid={fieldErrors.warehouseId ? true : undefined}
            aria-describedby={describedBy("warehouseId")}
            className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
          >
            <option value="">Elige una bodega…</option>
            {options.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {options.showBranch ? `${warehouse.branchName} · ${warehouse.name}` : warehouse.name}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <FormField name="purchasedOn" label="Fecha de la compra" required error={fieldErrors.purchasedOn}>
        <Input
          id="purchasedOn"
          name="purchasedOn"
          type="date"
          defaultValue={values.purchasedOn}
          max={options.today}
          required
          aria-invalid={fieldErrors.purchasedOn ? true : undefined}
          aria-describedby={describedBy("purchasedOn")}
          className={fieldClass}
        />
      </FormField>

      <FormField
        name="supplierInvoice"
        label="Factura o remisión del proveedor"
        error={fieldErrors.supplierInvoice}
      >
        <Input
          id="supplierInvoice"
          name="supplierInvoice"
          defaultValue={values.supplierInvoice}
          maxLength={40}
          autoComplete="off"
          placeholder="Opcional. Ej: FE-1234"
          aria-invalid={fieldErrors.supplierInvoice ? true : undefined}
          aria-describedby={describedBy("supplierInvoice")}
          className={fieldClass}
        />
      </FormField>
    </div>
  );
}

function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" aria-live="polite">
      <TriangleAlert />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

// Nueva compra: al crear el borrador abre su página.
export function NewPurchaseForm({
  companySlug,
  options,
}: {
  companySlug: string;
  options: PurchaseFormOptions;
}) {
  const [state, formAction, pending] = useActionState(
    createPurchaseAction,
    formState<PurchaseHeaderField>({
      supplierId: "",
      warehouseId: options.defaultWarehouseId,
      purchasedOn: options.today,
      supplierInvoice: "",
    }),
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="company" value={companySlug} />
      <ErrorAlert message={state.status === "error" ? state.message : null} />

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <p className="text-sm text-muted-foreground">
          Primero los datos de la factura; luego agregas los insumos. La compra queda en borrador
          hasta que la confirmes.
        </p>
        <HeaderFields options={options} values={state.values} fieldErrors={state.fieldErrors} />
      </section>

      <div className="sticky bottom-0 -mx-4 -mb-6 flex items-center justify-end gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href={`/${companySlug}/compras`}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-11 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          Crear borrador
        </Button>
      </div>
    </form>
  );
}

// "Cambiar" el encabezado de un borrador (sin JS, con <details>). Usarlo con
// key = valores guardados: tras guardar se vuelve a montar cerrado.
export function EditPurchaseHeaderForm({
  companySlug,
  purchaseId,
  options,
  initialValues,
}: {
  companySlug: string;
  purchaseId: string;
  options: PurchaseFormOptions;
  initialValues: PurchaseHeaderValues;
}) {
  const [state, formAction, pending] = useActionState(
    updatePurchaseHeaderAction,
    formState<PurchaseHeaderField>(initialValues),
  );

  return (
    <details className="group" open={state.status === "error" || undefined}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-semibold text-link [&::-webkit-details-marker]:hidden">
        <Pencil className="size-3.5" aria-hidden />
        Cambiar datos de la factura
      </summary>
      <form
        action={formAction}
        className="mt-3 flex flex-col gap-4 rounded-lg border border-border bg-background p-4"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={purchaseId} />
        <ErrorAlert message={state.status === "error" ? state.message : null} />
        <HeaderFields options={options} values={state.values} fieldErrors={state.fieldErrors} />
        <div className="flex justify-end">
          <Button type="submit" disabled={pending} className="gap-1.5">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            Guardar
          </Button>
        </div>
      </form>
    </details>
  );
}
