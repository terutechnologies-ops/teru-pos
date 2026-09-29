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
  it("OWNER gestiona ADMIN y STAFF; ADMIN solo STAFF; nadie al OWNER", () => {
    expect(manageableRoles("OWNER")).toEqual(["STAFF", "ADMIN"]);
    expect(manageableRoles("ADMIN")).toEqual(["STAFF"]);
    expect(manageableRoles("STAFF")).toEqual([]);
    expect(canManageRole("OWNER", "ADMIN")).toBe(true);
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false);
    expect(canManageRole("ADMIN", "STAFF")).toBe(true);
    for (const actor of ["OWNER", "ADMIN", "STAFF"] as const) {
      expect(canManageRole(actor, "OWNER")).toBe(false);
    }
  });
});
