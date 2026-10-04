import type { Metadata } from "next";
import { ListOrdered, ReceiptText, Tags } from "lucide-react";

import { createExpenseCategoryAction } from "@/components/expenses/expense-category-actions";
import { ExpenseCategoryList } from "@/components/expenses/expense-category-list";
import { EmptyState } from "@/components/shared/empty-state";
import { NewNameForm } from "@/components/shared/new-name-form";
import { PageHeader } from "@/components/shared/page-header";
import { SectionTitle } from "@/components/shared/section-title";
import { requirePermission } from "@/server/http/staff-session";
import { getExpenseCategories } from "@/server/services/expense-categories";

export const metadata: Metadata = { title: "Configuración · Categorías de gasto" };

export default async function ExpenseCategoriesPage({
  params,
}: PageProps<"/[empresa]/configuracion/gastos">) {
  const { empresa } = await params;
  const session = await requirePermission(empresa, "expenses.manage");
  const categories = await getExpenseCategories(session);
  const slug = session.company.slug;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        eyebrow="Configuración"
        title="Categorías de gasto"
        description="En qué se gasta el efectivo de la caja. El cajero elige una al registrar un gasto, en el orden de esta lista."
      />

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<Tags className="size-5" aria-hidden />}
          title="Nueva categoría"
          description="Se agrega al final de la lista."
        />
        <NewNameForm
          action={createExpenseCategoryAction}
          companySlug={slug}
          inputId="new-expense-category"
          placeholder="Ej: Hielo, Propinas, Mantenimiento"
          maxLength={40}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-xl bg-card p-5 shadow-sm sm:p-6">
        <SectionTitle
          icon={<ListOrdered className="size-5" aria-hidden />}
          title={`Categorías (${categories.length})`}
          description="Usa las flechas para ordenarlas. Una categoría inactiva no se ofrece al registrar gastos; los que ya la usaron no cambian. Solo se elimina si nunca se usó."
        />
        {categories.length > 0 ? (
          <ExpenseCategoryList categories={categories} companySlug={slug} />
        ) : (
          <EmptyState
            icon={ReceiptText}
            title="Sin categorías"
            text="Crea al menos una para que el cajero pueda registrar gastos."
          />
        )}
      </section>
    </div>
  );
}
