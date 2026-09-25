import { describe, expect, it } from "vitest";

import {
  assertPermission,
  ForbiddenError,
  hasPermission,
} from "@/server/services/auth/permissions";

describe("hasPermission", () => {
  it("solo OWNER configura la empresa y gestiona el equipo", () => {
    for (const permission of ["company.setup", "team.manage"] as const) {
      expect(hasPermission("OWNER", permission)).toBe(true);
      expect(hasPermission("ADMIN", permission)).toBe(false);
      expect(hasPermission("STAFF", permission)).toBe(false);
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
