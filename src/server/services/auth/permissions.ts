import type { StaffRole } from "@/generated/prisma/enums";

// Roles fijos con permisos definidos en código (ver ADR 0002). Cada módulo
// agrega aquí los permisos que necesita cuando se construye.

export type Permission =
  | "company.manage"
  | "team.manage"
  | "catalog.manage"
  | "inventory.manage"
  // Vender en el POS y manejar el propio turno de caja.
  | "sales.charge"
  | "sales.view"
  | "sales.void"
  | "cash.review"
  // Cerrar el turno que otra persona dejó abierto.
  | "cash.close"
  // Anular un gasto, retiro o ingreso de caja (turno abierto).
  | "cash.void"
  // Categorías de gasto.
  | "expenses.manage"
  | "payments.manage"
  // Proveedores y compras de insumos.
  | "purchases.manage";

// Lo que comparten OWNER y ADMIN: administración del negocio y ventas.
const MANAGEMENT: readonly Permission[] = [
  "team.manage",
  "catalog.manage",
  "inventory.manage",
  "sales.charge",
  "sales.view",
  "sales.void",
  "cash.review",
  "cash.close",
  "cash.void",
  "expenses.manage",
  "payments.manage",
  "purchases.manage",
];

const ROLE_PERMISSIONS = {
  OWNER: ["company.manage", ...MANAGEMENT],
  ADMIN: MANAGEMENT,
  STAFF: [],
  CASHIER: ["sales.charge"],
} satisfies Record<StaffRole, readonly Permission[]>;

export function hasPermission(role: StaffRole, permission: Permission) {
  return (ROLE_PERMISSIONS[role] as readonly Permission[]).includes(permission);
}

export class ForbiddenError extends Error {
  constructor(readonly permission: Permission) {
    super(`Permiso requerido: ${permission}`);
    this.name = "ForbiddenError";
  }
}

// Para servicios: rechaza la operación aunque la acción se invoque sin pasar
// por la página que la protege.
export function assertPermission(
  session: { user: { role: StaffRole } },
  permission: Permission,
) {
  if (!hasPermission(session.user.role, permission)) {
    throw new ForbiddenError(permission);
  }
}
