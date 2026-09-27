import type { StaffRole } from "@/generated/prisma/enums";

// Nombres de los roles para la interfaz (cliente y servidor).

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  STAFF: "Personal",
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
