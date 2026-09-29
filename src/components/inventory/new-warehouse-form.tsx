"use client";

import { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";

import type { NameFormState } from "@/components/shared/rename-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { createWarehouseAction } from "./warehouse-actions";

const initialState: NameFormState = { status: "idle", error: null, name: "" };

const fieldClass = "h-11 rounded-lg border-transparent bg-muted text-sm focus-visible:bg-card";

type BranchOption = { id: string; name: string };

// Con una sola sucursal no se muestra el selector: la bodega va en ella.
export function NewWarehouseForm({
  companySlug,
  branches,
}: {
  companySlug: string;
  branches: BranchOption[];
}) {
  const [state, formAction, pending] = useActionState(createWarehouseAction, initialState);
  const singleBranch = branches.length === 1 ? branches[0] : null;

  return (
    // Tras enviar, React reinicia el formulario: vacío si se guardó, lo
    // escrito si hubo error.
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="company" value={companySlug} />
      {singleBranch && <input type="hidden" name="branchId" value={singleBranch.id} />}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="new-warehouse" className="text-[13px] font-semibold">
            Nombre
          </Label>
          <Input
            id="new-warehouse"
            name="name"
            defaultValue={state.name}
            placeholder="Ej: Cuarto frío, Despensa"
            required
            maxLength={60}
            autoComplete="off"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "new-warehouse-error" : undefined}
            className={fieldClass}
          />
        </div>

        {!singleBranch && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-56">
            <Label htmlFor="new-warehouse-branch" className="text-[13px] font-semibold">
              Sucursal
            </Label>
            <select
              id="new-warehouse-branch"
              name="branchId"
              required
              defaultValue={branches[0]?.id}
              className={cn(fieldClass, "w-full min-w-0 border px-3 outline-none")}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button type="submit" disabled={pending} className="h-11 shrink-0 gap-2 px-5">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Agregar
        </Button>
      </div>

      {state.error && (
        <p id="new-warehouse-error" role="alert" className="text-xs font-medium text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
