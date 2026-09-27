"use client";

import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import { ImagePlus, Loader2, Package, Save, TriangleAlert } from "lucide-react";

import { ImagePicker } from "@/components/shared/image-picker";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currencyDecimals, currencyName, formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";

import { ProductThumb } from "./product-thumb";
import type {
  ProductFormState,
  ProductFormValues,
  SaveProductAction,
} from "./product-fields";

const fieldClass =
  "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

type CategoryOption = { id: string; name: string; isActive: boolean };

// Crear y editar productos. El precio se escribe como número (16500) y se
// muestra al lado como se verá ("$ 16.500"): evita la ambigüedad de los
// separadores de miles.
export function ProductForm({
  action,
  companySlug,
  productId,
  currency,
  categories,
  initialValues,
  submitLabel,
}: {
  action: SaveProductAction;
  companySlug: string;
  productId?: string;
  currency: string;
  categories: CategoryOption[];
  initialValues: ProductFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
    message: null,
    fieldErrors: {},
    values: initialValues,
  } satisfies ProductFormState);
  const { values, fieldErrors } = state;
  const [price, setPrice] = useState(values.price);
  const [preparing, setPreparing] = useState(false);
  // Al crear, la foto va en el mismo formulario; al editar, en su tarjeta.
  const withImage = !productId;
  const decimals = currencyDecimals(currency);
  const amount = Number(price);
  const listHref = `/${companySlug}/catalogo/productos`;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="company" value={companySlug} />
      {productId && <input type="hidden" name="id" value={productId} />}

      {state.status === "error" && state.message && (
        <Alert variant="destructive" aria-live="polite">
          <TriangleAlert />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Package className="size-5" aria-hidden />}
          title="Datos del producto"
          description="Así aparecerá al vender."
        />

        <Field name="name" label="Nombre" required error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            maxLength={80}
            autoComplete="off"
            placeholder="Ej: Arepa reina pepiada"
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className={fieldClass}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field name="categoryId" label="Categoría" required error={fieldErrors.categoryId}>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={values.categoryId}
              required
              aria-invalid={fieldErrors.categoryId ? true : undefined}
              aria-describedby={fieldErrors.categoryId ? "categoryId-error" : undefined}
              className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
            >
              <option value="">Elige una categoría…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {!category.isActive && " (inactiva)"}
                </option>
              ))}
            </select>
          </Field>

          <Field name="price" label={`Precio (${currency})`} required error={fieldErrors.price}>
            <Input
              id="price"
              name="price"
              type="number"
              inputMode="decimal"
              min={0}
              step={decimals === 0 ? 1 : 1 / 10 ** decimals}
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
              placeholder={decimals === 0 ? "16500" : "4.50"}
              aria-invalid={fieldErrors.price ? true : undefined}
              aria-describedby={cn("price-preview", fieldErrors.price && "price-error")}
              className={fieldClass}
            />
            <p id="price-preview" className="text-xs text-muted-foreground">
              Se verá como{" "}
              <span className="font-bold text-link">
                {price !== "" && Number.isFinite(amount) && amount >= 0
                  ? formatMoney(amount, currency)
                  : "—"}
              </span>{" "}
              · {currencyName(currency)}
              {decimals === 0 && ", sin centavos"}
            </p>
          </Field>
        </div>

        <Field name="description" label="Descripción" error={fieldErrors.description}>
          <textarea
            id="description"
            name="description"
            defaultValue={values.description}
            maxLength={200}
            rows={3}
            placeholder="Opcional. Ej: con pollo, aguacate y mayonesa."
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={fieldErrors.description ? "description-error" : undefined}
            className="min-h-20 w-full rounded-lg border border-transparent bg-muted px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>
      </section>

      {withImage && (
        <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
          <SectionTitle
            icon={<ImagePlus className="size-5" aria-hidden />}
            title="Foto (opcional)"
            description="PNG, JPG o WebP. Puedes subir la foto del celular: se reduce antes de enviarla."
          />
          <ImagePicker
            id="image"
            current={<ProductThumb imageUrl={null} productName="" size="lg" />}
            invalid={Boolean(fieldErrors.image)}
            describedBy={fieldErrors.image || state.imageDropped ? "image-error" : undefined}
            onPreparingChange={setPreparing}
          />
          {(fieldErrors.image || state.imageDropped) && (
            <p id="image-error" className="text-xs font-medium text-destructive">
              {fieldErrors.image ?? "Vuelve a elegir la foto: el navegador la descarta al corregir el formulario."}
            </p>
          )}
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-6 flex items-center justify-end gap-3 border-t border-border bg-background/90 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        <Button asChild variant="outline" className="h-11 px-4">
          <Link href={listHref}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending || preparing} className="h-11 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  required,
  error,
  children,
}: {
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={name} className="text-[13px] font-semibold">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p id={`${name}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
