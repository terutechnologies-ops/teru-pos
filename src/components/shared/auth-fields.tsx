"use client";

import { useState, type ComponentProps } from "react";
import { AtSign, Eye, EyeOff, Lock } from "lucide-react";

import { Input } from "@/components/ui/input";

// Campos con ícono usados en las pantallas de acceso (login y recuperación).

const fieldClass =
  "h-12 rounded-xl border-2 border-input bg-card pl-11 text-sm shadow-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20";
const iconClass =
  "pointer-events-none absolute left-4 size-5 text-muted-foreground";

type FieldProps = Omit<ComponentProps<typeof Input>, "type" | "className">;

export function EmailField(props: FieldProps) {
  return (
    <div className="relative flex items-center">
      <AtSign className={iconClass} aria-hidden />
      <Input
        type="email"
        placeholder="ejemplo@correo.com"
        className={fieldClass}
        {...props}
      />
    </div>
  );
}

export function PasswordField(props: FieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative flex items-center">
      <Lock className={iconClass} aria-hidden />
      <Input
        type={visible ? "text" : "password"}
        placeholder="••••••••"
        className={`${fieldClass} pr-12`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
