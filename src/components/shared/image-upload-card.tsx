"use client";

import { useActionState, useState, type ReactNode } from "react";
import { CircleCheck, ImageUp, Loader2, Trash2, TriangleAlert } from "lucide-react";

import { SectionTitle } from "@/components/shared/section-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { ImagePicker } from "./image-picker";
import type { ImageFormAction, ImageFormState } from "./image-upload-fields";

const initialState: ImageFormState = { status: "idle", message: null };

// Subir, cambiar y quitar una imagen ya asociada (logo, foto de un producto
// existente). Dos formularios; funcionan sin JS.
export function ImageUploadCard({
  title,
  description,
  preview,
  hasImage,
  hiddenFields,
  uploadAction,
  removeAction,
  labels,
}: {
  title: string;
  description: string;
  // Imagen actual (o su marcador vacío).
  preview: ReactNode;
  hasImage: boolean;
  hiddenFields: Record<string, string>;
  uploadAction: ImageFormAction;
  removeAction: ImageFormAction;
  labels: { upload: string; change: string; remove: string };
}) {
  const [upload, uploadFormAction, uploading] = useActionState(uploadAction, initialState);
  const [remove, removeFormAction, removing] = useActionState(removeAction, initialState);
  const [last, setLast] = useState<"upload" | "remove">("upload");
  const [preparing, setPreparing] = useState(false);
  const state = last === "upload" ? upload : remove;

  const hidden = Object.entries(hiddenFields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  return (
    <section className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
      <SectionTitle
        icon={<ImageUp className="size-5" aria-hidden />}
        title={title}
        description={description}
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

      <form
        action={uploadFormAction}
        onSubmit={() => setLast("upload")}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        {hidden}
        <ImagePicker required current={preview} onPreparingChange={setPreparing} />
        <Button
          type="submit"
          disabled={uploading || preparing}
          className="h-11 gap-2 self-start px-4 sm:self-auto"
        >
          {uploading || preparing ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ImageUp aria-hidden />
          )}
          {hasImage ? labels.change : labels.upload}
        </Button>
      </form>

      {hasImage && (
        <form action={removeFormAction} onSubmit={() => setLast("remove")}>
          {hidden}
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={removing}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            {removing ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            {labels.remove}
          </Button>
        </form>
      )}
    </section>
  );
}
