"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Image from "next/image";

import { IMAGE_ACCEPT } from "@/lib/images";
import { prepareImageForUpload } from "@/lib/prepare-image";
import { cn } from "@/lib/utils";

// Campo de imagen con vista previa. Con JS, al elegir el archivo lo reduce
// (ver prepareImageForUpload) y lo reemplaza en el campo antes de enviar;
// sin JS envía el original. Se limpia cuando el formulario se reinicia
// (React lo hace tras cada acción).
export function ImagePicker({
  name = "image",
  id,
  required,
  current,
  invalid,
  describedBy,
  onPreparingChange,
}: {
  name?: string;
  id?: string;
  required?: boolean;
  // Imagen actual o marcador vacío.
  current: ReactNode;
  invalid?: boolean;
  describedBy?: string;
  onPreparingChange?: (preparing: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  // Libera la vista previa anterior.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => {
      setFileName(null);
      setPreview(null);
    };
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  function setBusy(value: boolean) {
    setPreparing(value);
    onPreparingChange?.(value);
  }

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const original = input.files?.[0];
    if (!original) {
      setFileName(null);
      setPreview(null);
      return;
    }
    setBusy(true);
    const prepared = await prepareImageForUpload(original);
    const transfer = new DataTransfer();
    transfer.items.add(prepared);
    input.files = transfer.files;
    setFileName(original.name);
    setPreview(URL.createObjectURL(prepared));
    setBusy(false);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
      <div className="self-start">
        {preview ? (
          <span className="flex size-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-ring bg-muted">
            <Image
              src={preview}
              alt="Vista previa de la imagen elegida"
              width={96}
              height={96}
              unoptimized
              className="size-full object-contain"
            />
          </span>
        ) : (
          current
        )}
      </div>
      <label
        className={cn(
          "flex h-11 max-w-full min-w-0 cursor-pointer items-center rounded-lg border-2 border-dashed border-input bg-muted px-3 text-sm text-muted-foreground transition-colors hover:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          invalid && "border-destructive",
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          name={name}
          accept={IMAGE_ACCEPT}
          required={required}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="sr-only"
          onChange={onChange}
        />
        <span className="truncate">
          {preparing ? "Optimizando imagen…" : (fileName ?? "Elegir imagen…")}
        </span>
      </label>
    </div>
  );
}
