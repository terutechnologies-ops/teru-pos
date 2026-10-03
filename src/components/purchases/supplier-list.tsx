import Link from "next/link";
import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SupplierDto } from "@/server/services/third-parties";

import { SupplierRowButton } from "./supplier-row-button";

// Proveedores en orden alfabético con su NIT y contacto.
export function SupplierList({
  suppliers,
  companySlug,
}: {
  suppliers: SupplierDto[];
  companySlug: string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl bg-card px-5 shadow-sm sm:px-6">
      {suppliers.map((supplier) => {
        const href = `/${companySlug}/compras/proveedores/${supplier.id}`;
        const details = [
          supplier.taxId && `NIT ${supplier.taxId}`,
          supplier.phone,
          supplier.email,
        ].filter(Boolean);
        return (
          <li
            key={supplier.id}
            className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
          >
            <div
              className={cn("flex min-w-0 flex-1 flex-col gap-0.5", supplier.isArchived && "opacity-70")}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Link href={href} className="truncate font-bold hover:underline">
                  {supplier.name}
                </Link>
                {supplier.isArchived && <Badge variant="secondary">Archivado</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {details.length > 0 ? details.join(" · ") : "Sin NIT ni contacto"}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={href} aria-label={`Editar ${supplier.name}`}>
                  <Pencil aria-hidden />
                  Editar
                </Link>
              </Button>
              <SupplierRowButton
                companySlug={companySlug}
                intent={supplier.isArchived ? "restore" : "archive"}
                id={supplier.id}
                supplierName={supplier.name}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
