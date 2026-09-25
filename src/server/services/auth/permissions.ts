import type { StaffRole } from "@/generated/prisma/enums";

// Roles fijos con permisos definidos en código (ver ADR 0002). Cada módulo
// agrega aquí los permisos que necesita cuando se construye.

export type Permission = "company.setup" | "team.manage";

const ROLE_PERMISSIONS = {
  OWNER: ["company.setup", "team.manage"],
  ADMIN: [],
  STAFF: [],
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
