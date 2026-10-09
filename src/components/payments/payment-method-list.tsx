import { RenameForm } from "@/components/shared/rename-form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PaymentMethodOverview } from "@/server/services/payment-methods";

import { renamePaymentMethodAction } from "./payment-method-actions";
import { PaymentMethodRowButton } from "./payment-method-row-button";

// Métodos de pago en el orden en que se ofrecerán al cobrar. Siempre hay al
// menos uno (el efectivo, que crea el sistema).
export function PaymentMethodList({
  methods,
  companySlug,
}: {
  methods: PaymentMethodOverview[];
  companySlug: string;
}) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {methods.map((method, index) => (
        <li
          key={method.id}
          className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className="flex shrink-0 flex-col">
              <PaymentMethodRowButton
                companySlug={companySlug}
                intent="up"
                id={method.id}
                methodName={method.name}
                disabled={index === 0}
              />
              <PaymentMethodRowButton
                companySlug={companySlug}
                intent="down"
                id={method.id}
                methodName={method.name}
                disabled={index === methods.length - 1}
              />
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1.5 pt-1",
                !method.isActive && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-bold">{method.name}</span>
                {(method.isCash || method.isCredit) && <Badge variant="secondary">Del sistema</Badge>}
                {!method.isActive && <Badge variant="destructive">Inactivo</Badge>}
              </div>
              {method.isCredit && (
                <p className="text-xs text-muted-foreground">
                  Para vender a crédito a los clientes de cartera (pide elegir el cliente y
                  respeta su cupo). Actívalo cuando lo vayas a usar.
                </p>
              )}
              {method.isCash ? (
                <p className="text-xs text-muted-foreground">
                  Cuenta en el cuadre de caja y permite dar cambio. No se renombra ni se
                  desactiva.
                </p>
              ) : (
                <RenameForm
                  key={method.name}
                  action={renamePaymentMethodAction}
                  companySlug={companySlug}
                  id={method.id}
                  currentName={method.name}
                  maxLength={40}
                />
              )}
            </div>
          </div>

          {!method.isCash && (
            <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
              <PaymentMethodRowButton
                companySlug={companySlug}
                intent={method.isActive ? "deactivate" : "activate"}
                id={method.id}
                methodName={method.name}
              />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
