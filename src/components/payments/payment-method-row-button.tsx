"use client";

import { ArrowDown, ArrowUp, Ban, CircleCheck } from "lucide-react";

import { RowActionButton } from "@/components/shared/row-action-button";

import { paymentMethodRowAction } from "./payment-method-actions";
import type { PaymentMethodIntent } from "./payment-method-fields";

const INTENTS = {
  up: { label: "Subir", icon: ArrowUp, variant: "ghost", iconOnly: true },
  down: { label: "Bajar", icon: ArrowDown, variant: "ghost", iconOnly: true },
  activate: { label: "Activar", icon: CircleCheck },
  deactivate: { label: "Desactivar", icon: Ban },
} as const satisfies Record<PaymentMethodIntent, object>;

export function PaymentMethodRowButton({
  companySlug,
  intent,
  id,
  methodName,
  disabled,
}: {
  companySlug: string;
  intent: PaymentMethodIntent;
  id: string;
  methodName: string;
  disabled?: boolean;
}) {
  return (
    <RowActionButton
      action={paymentMethodRowAction}
      companySlug={companySlug}
      intent={intent}
      id={id}
      subject={methodName}
      disabled={disabled}
      {...INTENTS[intent]}
    />
  );
}
