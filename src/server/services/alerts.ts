import "server-only";

import type { StaffSessionDto } from "@/server/dto/auth";
import { hasPermission } from "@/server/services/auth/permissions";
import { getProductAlertCounts, type ProductAlert } from "@/server/services/catalog";
import { getSupplyAlertCounts, type SupplyAlert } from "@/server/services/inventory";

// Pendientes del inicio del panel: cada grupo solo con el permiso de su
// módulo (null = sin permiso, no se muestra).
export type PendingAlerts = {
  products: Record<ProductAlert, number> | null;
  supplies: Record<SupplyAlert, number> | null;
};

export async function getPendingAlerts(session: StaffSessionDto): Promise<PendingAlerts> {
  const role = session.user.role;
  const [products, supplies] = await Promise.all([
    hasPermission(role, "catalog.manage") ? getProductAlertCounts(session) : null,
    hasPermission(role, "inventory.manage") ? getSupplyAlertCounts(session) : null,
  ]);
  return { products, supplies };
}
