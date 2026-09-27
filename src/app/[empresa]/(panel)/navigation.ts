import { FolderTree, House, Store, Users, type LucideIcon } from "lucide-react";

import type { StaffRole } from "@/generated/prisma/enums";
import {
  hasPermission,
  type Permission,
} from "@/server/services/auth/permissions";

// Secciones del panel. Solo se listan módulos que existen; cada uno agrega
// aquí su entrada con el permiso que exige su página. Los grupos aparecen
// en el orden de su primera sección. Ocultar un enlace no
// autoriza nada: cada página vuelve a verificar su permiso.

export type NavGroup = "general" | "catalog" | "settings";

export type NavItem = {
  id: string;
  label: string;
  description: string;
  // Ruta dentro de la empresa ("" = inicio).
  path: string;
  icon: LucideIcon;
  group: NavGroup;
  // null = cualquier miembro con sesión.
  permission: Permission | null;
};

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  general: "General",
  catalog: "Catálogo",
  settings: "Configuración",
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "home",
    label: "Inicio",
    description: "Resumen de tu empresa.",
    path: "",
    icon: House,
    group: "general",
    permission: null,
  },
  {
    id: "catalog-categories",
    label: "Categorías",
    description: "Secciones del menú y su orden.",
    path: "catalogo/categorias",
    icon: FolderTree,
    group: "catalog",
    permission: "catalog.manage",
  },
  {
    id: "settings-business",
    label: "Negocio",
    description: "Datos comerciales, moneda y formatos.",
    path: "configuracion/negocio",
    icon: Store,
    group: "settings",
    permission: "company.manage",
  },
  {
    id: "settings-team",
    label: "Equipo",
    description: "Invitaciones y miembros del personal.",
    path: "configuracion/equipo",
    icon: Users,
    group: "settings",
    permission: "team.manage",
  },
];

export function navigationFor(role: StaffRole) {
  return NAV_ITEMS.filter(
    (item) => item.permission === null || hasPermission(role, item.permission),
  );
}

export function navHref(companySlug: string, item: Pick<NavItem, "path">) {
  return item.path ? `/${companySlug}/${item.path}` : `/${companySlug}`;
}
