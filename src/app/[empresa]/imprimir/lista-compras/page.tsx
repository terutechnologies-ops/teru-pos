import type { Metadata } from "next";

import { PrintFrame } from "@/components/printing/print-frame";
import { ShoppingListSheet } from "@/components/printing/shopping-list-sheet";
import { requirePermission } from "@/server/http/staff-session";
import { getShoppingList } from "@/server/services/shopping-list";

export const metadata: Metadata = { title: "Lista de compras" };

export default async function ShoppingListSheetPage({
  params,
}: PageProps<"/[empresa]/imprimir/lista-compras">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "inventory.manage");
  const sheet = await getShoppingList(session);

  return (
    <PrintFrame
      backHref={`/${session.company.slug}/inventario/lista-de-compras`}
      auto={false}
      allowLetter
    >
      <ShoppingListSheet sheet={sheet} />
    </PrintFrame>
  );
}
