import Link from "next/link";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import type { CustomerDto } from "@/server/services/customers";

import { CustomerRowButton } from "./customer-row-button";

// Clientes en orden alfabético: contacto, cupo, saldo y disponible.
export function CustomerList({
  customers,
  companySlug,
  currency,
}: {
  customers: CustomerDto[];
  companySlug: string;
  currency: string;
}) {
  const money = (value: string) => formatMoney(Number(value), currency);
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card px-5 shadow-sm sm:px-6">
      {customers.map((customer) => {
        const href = `/${companySlug}/clientes/${customer.id}/editar`;
        const noCredit = Number(customer.creditLimit) === 0;
        const owes = Number(customer.balance) > 0;
        const details = [customer.taxId && `NIT ${customer.taxId}`, customer.phone, customer.email].filter(Boolean);
        return (
          <li key={customer.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", customer.isArchived && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={href} className="truncate font-bold hover:underline">
                  {customer.name}
                </Link>
                {customer.isArchived && <Badge variant="secondary">Archivado</Badge>}
                {noCredit && !customer.isArchived && <Badge variant="secondary">Sin crédito</Badge>}
                {!customer.email && <Badge variant="outline">Sin correo</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {details.length > 0 ? details.join(" · ") : "Sin NIT ni contacto"}
              </p>
              <p className="text-sm tabular-nums">
                <span className="text-muted-foreground">Cupo </span>
                {money(customer.creditLimit)}
                <span className="text-muted-foreground"> · Debe </span>
                <span className={cn(owes && "font-semibold")}>{money(customer.balance)}</span>
                <span className="text-muted-foreground"> · Disponible </span>
                {money(customer.available)}
                <span className="text-muted-foreground"> · Plazo {customer.creditDays} días</span>
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={href} aria-label={`Editar ${customer.name}`}>
                  <Pencil aria-hidden />
                  Editar
                </Link>
              </Button>
              <CustomerRowButton
                companySlug={companySlug}
                intent={customer.isArchived ? "restore" : "archive"}
                id={customer.id}
                customerName={customer.name}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
