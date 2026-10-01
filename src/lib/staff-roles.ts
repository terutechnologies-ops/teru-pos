import type { StaffRole } from "@/generated/prisma/enums";

// Nombres de los roles para la interfaz (cliente y servidor).

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  STAFF: "Personal",
  CASHIER: "Cajero",
};

// OWNER no se invita: el primero sale del script de alta de la empresa.
export const INVITABLE_ROLES = ["STAFF", "ADMIN"] as const satisfies readonly StaffRole[];

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const INVITABLE_ROLE_DESCRIPTIONS: Record<InvitableRole, string> = {
  STAFF: "Operación del día a día. Sus funciones llegan con cada módulo.",
  ADMIN: "Apoya la administración del negocio. Sus permisos se amplían con cada módulo.",
};

export function isInvitableRole(value: string): value is InvitableRole {
  return (INVITABLE_ROLES as readonly string[]).includes(value);
}

// Qué roles puede gestionar cada rol (invitar, reenviar, revocar, activar).
// El OWNER no se gestiona desde la aplicación. Complementa el permiso
// team.manage: el permiso da acceso, esto limita sobre quién.
const MANAGEABLE_ROLES: Record<StaffRole, readonly InvitableRole[]> = {
  OWNER: INVITABLE_ROLES,
  ADMIN: ["STAFF"],
  STAFF: [],
  CASHIER: [],
};

export function manageableRoles(actor: StaffRole): readonly InvitableRole[] {
  return MANAGEABLE_ROLES[actor];
}

export function canManageRole(actor: StaffRole, target: StaffRole) {
  return (MANAGEABLE_ROLES[actor] as readonly StaffRole[]).includes(target);
}
