import { describe, expect, it } from "vitest";

import { canManageRole, manageableRoles } from "@/lib/staff-roles";
import {
  assertPermission,
  ForbiddenError,
  hasPermission,
} from "@/server/services/auth/permissions";

describe("hasPermission", () => {
  it("solo OWNER configura la empresa", () => {
    expect(hasPermission("OWNER", "company.manage")).toBe(true);
    expect(hasPermission("ADMIN", "company.manage")).toBe(false);
    expect(hasPermission("STAFF", "company.manage")).toBe(false);
  });

  it("OWNER y ADMIN gestionan el catálogo", () => {
    expect(hasPermission("OWNER", "catalog.manage")).toBe(true);
    expect(hasPermission("ADMIN", "catalog.manage")).toBe(true);
    expect(hasPermission("STAFF", "catalog.manage")).toBe(false);
  });

  it("OWNER y ADMIN gestionan el inventario", () => {
    expect(hasPermission("OWNER", "inventory.manage")).toBe(true);
    expect(hasPermission("ADMIN", "inventory.manage")).toBe(true);
    expect(hasPermission("STAFF", "inventory.manage")).toBe(false);
  });

  it("OWNER y ADMIN gestionan el equipo", () => {
    expect(hasPermission("OWNER", "team.manage")).toBe(true);
    expect(hasPermission("ADMIN", "team.manage")).toBe(true);
    expect(hasPermission("STAFF", "team.manage")).toBe(false);
  });

  it("OWNER, ADMIN y CASHIER venden; STAFF no", () => {
    for (const role of ["OWNER", "ADMIN", "CASHIER"] as const) {
      expect(hasPermission(role, "sales.charge")).toBe(true);
    }
    expect(hasPermission("STAFF", "sales.charge")).toBe(false);
  });

  it("solo OWNER y ADMIN ven y anulan ventas, revisan y cierran turnos y configuran pagos", () => {
    const admin = [
      "sales.view",
      "sales.void",
      "cash.review",
      "cash.close",
      "payments.manage",
    ] as const;
    for (const permission of admin) {
      expect(hasPermission("OWNER", permission)).toBe(true);
      expect(hasPermission("ADMIN", permission)).toBe(true);
      expect(hasPermission("CASHIER", permission)).toBe(false);
      expect(hasPermission("STAFF", permission)).toBe(false);
    }
  });

  it("CASHIER no entra a la administración", () => {
    for (const permission of ["company.manage", "team.manage", "catalog.manage", "inventory.manage"] as const) {
      expect(hasPermission("CASHIER", permission)).toBe(false);
    }
  });
});

describe("assertPermission", () => {
  it("lanza ForbiddenError sin el permiso y no lanza con él", () => {
    const staff = { user: { role: "STAFF" as const } };
    expect(() => assertPermission(staff, "team.manage")).toThrow(ForbiddenError);
    expect(() =>
      assertPermission({ user: { role: "OWNER" } }, "team.manage"),
    ).not.toThrow();
  });
});

describe("roles gestionables", () => {
  it("OWNER gestiona ADMIN, STAFF y CASHIER; ADMIN solo STAFF y CASHIER; nadie al OWNER", () => {
    expect(manageableRoles("OWNER")).toEqual(["CASHIER", "STAFF", "ADMIN"]);
    expect(manageableRoles("ADMIN")).toEqual(["CASHIER", "STAFF"]);
    expect(manageableRoles("STAFF")).toEqual([]);
    expect(manageableRoles("CASHIER")).toEqual([]);
    expect(canManageRole("OWNER", "ADMIN")).toBe(true);
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false);
    expect(canManageRole("ADMIN", "STAFF")).toBe(true);
    expect(canManageRole("ADMIN", "CASHIER")).toBe(true);
    for (const actor of ["OWNER", "ADMIN", "STAFF", "CASHIER"] as const) {
      expect(canManageRole(actor, "OWNER")).toBe(false);
    }
  });
});
