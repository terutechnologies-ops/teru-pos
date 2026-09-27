"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { Check, Send, Store, Users } from "lucide-react";

import { cn } from "@/lib/utils";

// Pasos del asistente en esta fase. Insumos y producto se insertan cuando
// existan sus módulos.
export const SETUP_STEPS = [
  { segment: "negocio", label: "Negocio", icon: Store },
  { segment: "equipo", label: "Equipo", icon: Users },
  { segment: "confirmar", label: "Confirmar", icon: Send },
] as const;

export function SetupStepper() {
  const segment = useSelectedLayoutSegment();
  const current = Math.max(
    0,
    SETUP_STEPS.findIndex((step) => step.segment === segment),
  );

  return (
    <ol className="grid grid-cols-3 gap-2 sm:gap-4">
      {SETUP_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const Icon = done ? Check : step.icon;
        return (
          <li
            key={step.segment}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3",
              active && "border-ring bg-card shadow-sm",
              !active && "border-transparent bg-muted/60",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                active && "bg-primary text-primary-foreground",
                done && "bg-accent text-accent-foreground",
                !active && !done && "bg-secondary text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="hidden min-w-0 flex-col sm:flex">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Paso {index + 1}
                {active && " · En curso"}
              </span>
              <span className="truncate text-sm font-bold">{step.label}</span>
            </span>
            <span className="text-sm font-bold sm:hidden">{index + 1}</span>
          </li>
        );
      })}
    </ol>
  );
}
