"use client";

import { useActionState, useState } from "react";
import { CircleCheck, Loader2, Save, Search, Trash2, TriangleAlert } from "lucide-react";

import { DraftStep, ExternalFormStep } from "@/components/shared/draft-step";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatQuantity, UNIT_INFO } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { CountDraftDetail } from "@/server/services/inventory-counts";

import { deleteCountAction, saveCountAction } from "./count-actions";
import { COUNT_FORM_ID, countedName, unitName, type CountFormState } from "./count-fields";

const fieldClass = "h-10 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

// Lo escrito como número, o null si está en blanco o no es válido (solo
// para mostrar la diferencia; el servidor valida).
function parseCounted(value: string) {
  const text = value.trim().replace(",", ".");
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Difference({ value, unit }: { value: number | null; unit: CountDraftDetail["rows"][number]["unit"] }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  // Redondeo a la precisión de lo contado (3 decimales): evita "-0,000".
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) return <span className="text-muted-foreground">Cuadra</span>;
  return (
    <span className={cn("font-semibold", rounded < 0 && "text-destructive")}>
      {rounded < 0 ? "−" : "+"}
      {formatQuantity(Math.abs(rounded), unit)}
    </span>
  );
}

// Formulario del borrador: una fila por insumo con el saldo del sistema,
// lo contado y la diferencia (en vivo con JS). Guardar avance y confirmar
// envían todo lo escrito; en blanco = no se cuenta.
export function CountForm({
  companySlug,
  countId,
  warehouseLabel,
  draft,
}: {
  companySlug: string;
  countId: string;
  warehouseLabel: string;
  draft: CountDraftDetail;
}) {
  const { rows } = draft;
  const initialState: CountFormState = {
    status: "idle",
    intent: "save",
    message: null,
    fieldErrors: {},
    values: Object.fromEntries(rows.map((row) => [row.supplyId, row.counted])),
  };
  const [state, formAction, pending] = useActionState(saveCountAction, initialState);
  // Controlados: la diferencia se calcula mientras se escribe y lo escrito
  // no se pierde al guardar (el formulario se reinicia tras cada acción).
  const [values, setValues] = useState<Record<string, string>>(() => state.values);
  const [search, setSearch] = useState("");

  const countedCount = rows.filter((row) => (values[row.supplyId] ?? "").trim() !== "").length;
  const activeCount = rows.filter((row) => !row.archived).length;
  const query = normalize(search.trim());
  const visible = rows.filter((row) => !query || normalize(row.name).includes(query));
  const confirmError = state.status === "error" && state.intent === "confirm" ? state.message : null;

  return (
    <div className="flex flex-col gap-6">
      <form
        id={COUNT_FORM_ID}
        action={formAction}
        className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-sm sm:p-6"
      >
        <input type="hidden" name="company" value={companySlug} />
        <input type="hidden" name="id" value={countId} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            {/* Sin name: solo filtra la vista, no se envía. Las filas ocultas
                siguen en el formulario. */}
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar insumo"
              aria-label="Buscar insumo"
              className={cn(fieldClass, "pl-9")}
            />
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Contaste <strong className="text-foreground">{countedCount}</strong> de {activeCount}{" "}
            {activeCount === 1 ? "insumo" : "insumos"}
          </p>
        </div>

        {state.status === "error" && state.message && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <div className="hidden grid-cols-[minmax(0,1fr)_8rem_10rem_7rem] gap-3 border-b border-border pb-2 text-xs font-semibold text-muted-foreground md:grid">
          <span>Insumo</span>
          <span className="text-right">Sistema</span>
          <span>Contado</span>
          <span className="text-right">Diferencia</span>
        </div>

        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const value = values[row.supplyId] ?? "";
            const counted = parseCounted(value);
            const system = row.system === null ? 0 : Number(row.system);
            const error = state.fieldErrors[row.supplyId];
            const inputId = `contado-${row.supplyId}`;
            const hidden = !visible.includes(row);
            return (
              <li
                key={row.supplyId}
                className={cn(
                  "grid grid-cols-2 items-center gap-x-3 gap-y-2 py-3 md:grid-cols-[minmax(0,1fr)_8rem_10rem_7rem]",
                  hidden && "hidden",
                )}
              >
                <input type="hidden" name="supply" value={row.supplyId} />
                <input type="hidden" name={unitName(row.supplyId)} value={row.unit} />
                <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 md:col-span-1">
                  <label htmlFor={inputId} className="truncate font-semibold">
                    {row.name}
                  </label>
                  {row.archived && <Badge variant="destructive">Archivado</Badge>}
                </div>
                <div className="text-sm md:text-right">
                  <span className="text-xs text-muted-foreground md:hidden">Sistema: </span>
                  {row.system === null ? (
                    <span className="text-muted-foreground" title="Sin carga inicial en esta bodega">
                      —
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "tabular-nums",
                        row.system.startsWith("-") && "font-semibold text-destructive",
                      )}
                    >
                      {formatQuantity(row.system, row.unit)}
                    </span>
                  )}
                </div>
                <div className="row-start-3 flex flex-col gap-1 md:row-start-auto">
                  <div className="flex items-center gap-2">
                    <Input
                      id={inputId}
                      name={countedName(row.supplyId)}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={value}
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [row.supplyId]: event.target.value }))
                      }
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      className={cn(fieldClass, "w-28 text-right tabular-nums")}
                    />
                    <span className="text-sm text-muted-foreground">
                      {UNIT_INFO[row.unit].symbol}
                    </span>
                  </div>
                  {error && (
                    <p id={`${inputId}-error`} className="text-xs font-medium text-destructive">
                      {error}
                    </p>
                  )}
                </div>
                <div className="row-start-3 text-right text-sm tabular-nums md:row-start-auto">
                  <Difference value={counted === null ? null : counted - system} unit={row.unit} />
                </div>
              </li>
            );
          })}
        </ul>
        {visible.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ningún insumo coincide con la búsqueda.
          </p>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
          {state.status === "saved" && state.message && (
            <p className="flex items-center gap-1.5 text-sm text-success" aria-live="polite">
              <CircleCheck className="size-4" aria-hidden />
              {state.message}
            </p>
          )}
          <Button
            type="submit"
            name="intent"
            value="save"
            variant="outline"
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            Guardar avance
          </Button>
        </div>
      </form>

      <div className="flex flex-row-reverse flex-wrap items-start gap-3">
        <ExternalFormStep
          form={COUNT_FORM_ID}
          intent="confirm"
          pending={pending}
          error={confirmError}
          summary="Confirmar conteo"
          icon={<CircleCheck className="size-4" aria-hidden />}
          explanation={
            <>
              Lo contado se compara con el saldo de{" "}
              <strong className="text-foreground">{warehouseLabel}</strong> en este momento y las
              diferencias entran al kardex. Contaste {countedCount} de {activeCount}: los que
              quedan en blanco no se ajustan. El conteo recibe su número y ya no se puede cambiar.
            </>
          }
          submitLabel="Sí, confirmar el conteo"
          align="end"
        />
        <DraftStep
          action={deleteCountAction}
          companySlug={companySlug}
          id={countId}
          summary="Eliminar borrador"
          icon={<Trash2 className="size-4" aria-hidden />}
          explanation="Se borra lo contado hasta ahora. No afecta el inventario."
          submitLabel="Sí, eliminar el borrador"
          destructive
        />
      </div>
    </div>
  );
}
