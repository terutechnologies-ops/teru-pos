import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, ReceiptText } from "lucide-react";

import { CustomerStatement } from "@/components/customers/customer-statement";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/company-formats";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/http/staff-session";
import { getCustomerStatement } from "@/server/services/customers";

export const metadata: Metadata = { title: "Ventas · Cliente" };

// Estado de cuenta del cliente: lo que debe, lo vencido y sus movimientos.
export default async function CustomerPage({ params }: PageProps<"/[empresa]/clientes/[id]">) {
  const { empresa, id } = await params;
  const session = await requirePermission(empresa, "customers.manage");
  const statement = await getCustomerStatement(session, id);
  if (!statement) notFound();

  const { customer, currency } = statement;
  const slug = session.company.slug;
  const money = (value: string) => formatMoney(Number(value), currency);
  const overdue = Number(customer.overdue) > 0;
  const noCredit = Number(customer.creditLimit) === 0;
  const contact = [customer.taxId && `NIT ${customer.taxId}`, customer.phone, customer.email]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Link
        href={`/${slug}/clientes`}
        className="flex w-fit items-center gap-1 text-sm font-semibold text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Clientes
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Ventas · Cliente"
          title={
            <span className="flex flex-wrap items-center gap-2">
              {customer.name}
              {customer.isArchived && <Badge variant="secondary">Archivado</Badge>}
              {noCredit && !customer.isArchived && <Badge variant="secondary">Sin crédito</Badge>}
            </span>
          }
          description={contact || "Sin NIT ni contacto"}
        />
        <Button asChild variant="outline" className="gap-2">
          <Link href={`/${slug}/clientes/${customer.id}/editar`}>
            <Pencil aria-hidden />
            Editar
          </Link>
        </Button>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Debe</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(customer.balance)}</dd>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Vencido</dt>
          <dd className={cn("mt-1 text-2xl font-extrabold tabular-nums", overdue && "text-destructive")}>
            {money(customer.overdue)}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">Lo que pasó su plazo sin pagarse</dd>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Disponible</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(customer.available)}</dd>
        </div>
        <div className="rounded-xl bg-card p-5 shadow-sm">
          <dt className="text-xs font-semibold text-muted-foreground">Cupo</dt>
          <dd className="mt-1 text-2xl font-extrabold tabular-nums">{money(customer.creditLimit)}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">Plazo de {customer.creditDays} días</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ReceiptText className="size-5" aria-hidden />}
          title="Movimientos"
          description="Ventas a crédito y abonos, del más reciente al más antiguo. Los abonos pagan primero lo más viejo; los anulados no cambian el saldo."
        />
        {statement.movements.length > 0 ? (
          <CustomerStatement
            movements={statement.movements}
            companySlug={slug}
            currency={currency}
            dateFormat={statement.dateFormat}
            timeZone={statement.timeZone}
            today={statement.today}
            canViewSales={statement.canViewSales}
            canViewShifts={statement.canViewShifts}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no tiene ventas a crédito ni abonos.
          </p>
        )}
      </section>
    </div>
  );
}
