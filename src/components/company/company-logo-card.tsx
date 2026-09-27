"use client";

import { useActionState, useState } from "react";
import {
  CircleCheck,
  ImageUp,
  Loader2,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { CompanyMark } from "@/components/shared/company-mark";
import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LOGO_ACCEPT } from "@/lib/company-logo";

import {
  removeLogoAction,
  uploadLogoAction,
  type LogoFormState,
} from "./logo-actions";

const initialState: LogoFormState = { status: "idle", message: null };

// Logo de la empresa: dos formularios (subir y quitar), aparte del de datos
// del negocio porque el archivo viaja como multipart. Funcionan sin JS.
export function CompanyLogoCard({
  companySlug,
  companyName,
  logoUrl,
}: {
  companySlug: string;
  companyName: string;
  logoUrl: string | null;
}) {
  const [upload, uploadAction, uploading] = useActionState(uploadLogoAction, initialState);
  const [remove, removeAction, removing] = useActionState(removeLogoAction, initialState);
  const [fileName, setFileName] = useState<string | null>(null);
  // Se muestra el mensaje de la última acción enviada.
  const [last, setLast] = useState<"upload" | "remove">("upload");
  const state = last === "upload" ? upload : remove;

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
      <SectionTitle
        icon={<ImageUp className="size-5" aria-hidden />}
        title="Logo"
        description="Aparece en el inicio de sesión y en el menú. PNG, JPG o WebP de hasta 1 MB; mejor cuadrado y con fondo transparente."
      />

      {state.message && (
        <Alert
          variant={state.status === "error" ? "destructive" : "default"}
          aria-live="polite"
        >
          {state.status === "error" ? (
            <TriangleAlert />
          ) : (
            <CircleCheck className="text-success" />
          )}
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Vista previa sobre el morado oscuro, como se verá en el acceso. */}
        <div className="flex items-center justify-center self-start rounded-2xl bg-brand p-3">
          <CompanyMark logoUrl={logoUrl} companyName={companyName} size="lg" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <form
            action={uploadAction}
            onSubmit={() => setLast("upload")}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="company" value={companySlug} />
            <label className="flex h-11 max-w-full min-w-0 cursor-pointer items-center rounded-lg border-2 border-dashed border-input bg-muted px-3 text-sm text-muted-foreground transition-colors hover:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
              <input
                type="file"
                name="logo"
                accept={LOGO_ACCEPT}
                required
                className="sr-only"
                onChange={(event) =>
                  setFileName(event.target.files?.[0]?.name ?? null)
                }
              />
              <span className="truncate">{fileName ?? "Elegir imagen…"}</span>
            </label>
            <Button type="submit" disabled={uploading} className="h-11 gap-2 px-4">
              {uploading ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <ImageUp aria-hidden />
              )}
              {logoUrl ? "Cambiar logo" : "Subir logo"}
            </Button>
          </form>

          {logoUrl && (
            <form action={removeAction} onSubmit={() => setLast("remove")}>
              <input type="hidden" name="company" value={companySlug} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={removing}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                {removing ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <Trash2 aria-hidden />
                )}
                Quitar logo
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
