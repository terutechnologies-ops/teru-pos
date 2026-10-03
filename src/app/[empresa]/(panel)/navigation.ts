import {
  Boxes,
  FolderTree,
  House,
  Package,
  Receipt,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Vault,
  Wallet,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import type { StaffRole } from "@/generated/prisma/enums";
import {
  hasPermission,
  type Permission,
} from "@/server/services/auth/permissions";

// Secciones del panel. Solo se listan módulos que existen; cada uno agrega
// aquí su entrada con el permiso que exige su página. Los grupos aparecen
// en el orden de su primera sección. Ocultar un enlace no
// autoriza nada: cada página vuelve a verificar su permiso.

export type NavGroup =
  | "general"
  | "sales"
  | "purchases"
  | "catalog"
  | "inventory"
  | "settings";

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
  sales: "Ventas",
  purchases: "Compras",
  catalog: "Catálogo",
  inventory: "Inventario",
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
    // El POS es un área aparte (pantalla oscura, sin menú lateral).
    id: "pos",
    label: "Vender",
    description: "Abre el punto de venta para cobrar.",
    path: "pos",
    icon: ShoppingCart,
    group: "sales",
    permission: "sales.charge",
  },
  {
    id: "sales-list",
    label: "Ventas",
    description: "Lo vendido, con su detalle y anulaciones.",
    path: "ventas",
    icon: Receipt,
    group: "sales",
    permission: "sales.view",
  },
  {
    id: "cash-review",
    label: "Cierres de caja",
    description: "Turnos abiertos y cerrados, con su cuadre.",
    path: "caja",
    icon: Vault,
    group: "sales",
    permission: "cash.review",
  },
  {
    id: "purchases-suppliers",
    label: "Proveedores",
    description: "A quién le compras, con su NIT y contacto.",
    path: "compras/proveedores",
    icon: Truck,
    group: "purchases",
    permission: "purchases.manage",
  },
  {
    id: "catalog-products",
    label: "Productos",
    description: "Lo que vendes, con su precio y estado.",
    path: "catalogo/productos",
    icon: Package,
    group: "catalog",
    permission: "catalog.manage",
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
    id: "inventory-supplies",
    label: "Insumos",
    description: "Lo que guardas, con su existencia y mínimo.",
    path: "inventario/insumos",
    icon: Boxes,
    group: "inventory",
    permission: "inventory.manage",
  },
  {
    id: "inventory-warehouses",
    label: "Bodegas",
    description: "Dónde guardas tus insumos, por sucursal.",
    path: "inventario/bodegas",
    icon: Warehouse,
    group: "inventory",
    permission: "inventory.manage",
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
    id: "settings-payments",
    label: "Métodos de pago",
    description: "Cómo te pagan y en qué orden se ofrecen al cobrar.",
    path: "configuracion/pagos",
    icon: Wallet,
    group: "settings",
    permission: "payments.manage",
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

// Quien solo puede vender (el cajero) no tiene nada que hacer en el panel:
// entra directo al POS.
export function startsInPos(role: StaffRole) {
  const sections = navigationFor(role).filter((item) => item.id !== "home");
  return sections.length > 0 && sections.every((item) => item.id === "pos");
}

export function navHref(companySlug: string, item: Pick<NavItem, "path">) {
  return item.path ? `/${companySlug}/${item.path}` : `/${companySlug}`;
}
