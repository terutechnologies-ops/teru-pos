import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  createThirdPartySupplier,
  getSupplier,
  getSupplierList,
  setThirdPartySupplierArchived,
  updateThirdPartySupplier,
} from "@/server/services/third-parties";
import type { SupplierInput } from "@/server/validations/third-parties";

import { cleanupCompanies, createCompany, uniqueTag } from "../helpers";

const tag = uniqueTag("suppliers");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
});
afterAll(() => cleanupCompanies(tag));

// Los servicios reciben la sesión ya validada; aquí basta con su forma.
function sessionFor(company: Company, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: "u", name: "Prueba", email: `u@${tag}.co`, role },
    company: { ...company, setupCompletedAt: null, logoPath: null },
  };
}

const admin = () => sessionFor(a, "ADMIN");
// Lo que envía el formulario: todo texto, vacío = sin valor.
const input = (fields: Partial<SupplierInput> & Pick<SupplierInput, "name">): SupplierInput => ({
  taxId: "",
  phone: "",
  email: "",
  ...fields,
});
const create = (fields: Parameters<typeof input>[0], session = admin()) =>
  createThirdPartySupplier(session, input(fields));
const update = (id: string, fields: Parameters<typeof input>[0], session = admin()) =>
  updateThirdPartySupplier(session, id, input(fields));
const created = async (fields: Parameters<typeof input>[0], session = admin()) => {
  const result = await create(fields, session);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.supplierId;
};
const names = async (filters: Parameters<typeof getSupplierList>[1] = {}, session = admin()) =>
  (await getSupplierList(session, filters)).map((supplier) => supplier.name);

describe("proveedores (servicio)", () => {
  it("crea con validación; los opcionales vacíos quedan en null", async () => {
    const invalid = await create({ name: "A", email: "no-es-correo", taxId: "x".repeat(31) });
    expect(invalid).toMatchObject({ ok: false });
    if (!invalid.ok) {
      expect(Object.keys(invalid.fieldErrors).sort()).toEqual(["email", "name", "taxId"]);
    }

    const id = await created({ name: "  Distribuidora   El Maizal ", email: " Ventas@Maizal.CO " });
    expect(await getSupplier(admin(), id)).toEqual({
      id,
      name: "Distribuidora El Maizal",
      taxId: null,
      phone: null,
      email: "ventas@maizal.co",
      isArchived: false,
    });
  });

  it("nombre y NIT repetidos se marcan en su campo", async () => {
    await created({ name: "Lácteos La Vaca", taxId: "900111222-1" });
    // Dos proveedores sin NIT no chocan.
    await created({ name: "Plaza de mercado" });
    await created({ name: "Tienda de la esquina" });

    expect(await create({ name: "LÁCTEOS la vaca" })).toEqual({
      ok: false,
      fieldErrors: { name: "Ya existe un proveedor o cliente con ese nombre." },
    });
    expect(await create({ name: "Otro lácteo", taxId: "900111222-1" })).toEqual({
      ok: false,
      fieldErrors: { taxId: "Ya existe un proveedor o cliente con ese NIT." },
    });

    const plaza = (await getSupplierList(admin(), { search: "Plaza" }))[0].id;
    expect(await update(plaza, { name: "Plaza de mercado", taxId: "900111222-1" })).toEqual({
      ok: false,
      fieldErrors: { taxId: "Ya existe un proveedor o cliente con ese NIT." },
    });
    expect(await update(plaza, { name: "Lácteos La Vaca" })).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
    });
  });

  it("el nombre también es único frente a un tercero que solo es cliente, que no se lista", async () => {
    const customer = await db.thirdParty.create({
      data: { companyId: a.id, name: "Cliente Frecuente", isCustomer: true },
      select: { id: true },
    });
    expect(await names({ search: "Frecuente" })).toEqual([]);
    expect(await getSupplier(admin(), customer.id)).toBeNull();
    expect(await create({ name: "cliente frecuente" })).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
    });
    expect(await setThirdPartySupplierArchived(admin(), customer.id, true)).toMatchObject({
      ok: false,
    });
  });

  it("busca por nombre o NIT y separa activos de archivados", async () => {
    const id = await created({ name: "Gaseosas del Valle", taxId: "800555666" });
    expect(await names({ search: "gaseosas" })).toEqual(["Gaseosas del Valle"]);
    expect(await names({ search: "555" })).toEqual(["Gaseosas del Valle"]);
    expect(await names({ search: "   " })).toContain("Gaseosas del Valle");

    expect(await setThirdPartySupplierArchived(admin(), id, true)).toEqual({ ok: true });
    expect(await names()).not.toContain("Gaseosas del Valle");
    expect(await names({ archived: true })).toEqual(["Gaseosas del Valle"]);

    expect(await setThirdPartySupplierArchived(admin(), id, false)).toEqual({ ok: true });
    expect(await names()).toContain("Gaseosas del Valle");
  });

  it("edita los datos", async () => {
    const id = await created({ name: "Carnes Don Pepe" });
    expect(
      await update(id, { name: "Carnes Don Pepe S.A.S.", taxId: "901000000", phone: "3001234567" }),
    ).toEqual({ ok: true, supplierId: id });
    expect(await getSupplier(admin(), id)).toMatchObject({
      name: "Carnes Don Pepe S.A.S.",
      taxId: "901000000",
      phone: "3001234567",
      email: null,
    });
  });

  it("no ve ni toca proveedores de otra empresa", async () => {
    const id = await created({ name: "Proveedor de B", taxId: "900111222-1" }, sessionFor(b, "OWNER"));
    // El mismo nombre y NIT pueden existir en otra empresa.
    expect(await names({}, sessionFor(b, "OWNER"))).toEqual(["Proveedor de B"]);
    expect(await names()).not.toContain("Proveedor de B");
    expect(await getSupplier(admin(), id)).toBeNull();
    expect(await update(id, { name: "Tomado" })).toEqual({
      ok: false,
      fieldErrors: {},
      error: "El proveedor ya no existe. Actualiza la página.",
    });
    expect(await setThirdPartySupplierArchived(admin(), id, true)).toMatchObject({ ok: false });
    expect(await getSupplier(sessionFor(b, "OWNER"), id)).toMatchObject({
      name: "Proveedor de B",
      isArchived: false,
    });
  });

  it("personal y cajeros no gestionan proveedores", async () => {
    for (const role of ["STAFF", "CASHIER"] as const) {
      const session = sessionFor(a, role);
      await expect(getSupplierList(session, {})).rejects.toThrow(ForbiddenError);
      await expect(getSupplier(session, "x")).rejects.toThrow(ForbiddenError);
      await expect(create({ name: "Otro" }, session)).rejects.toThrow(ForbiddenError);
      await expect(update("x", { name: "Otro" }, session)).rejects.toThrow(ForbiddenError);
      await expect(setThirdPartySupplierArchived(session, "x", true)).rejects.toThrow(
        ForbiddenError,
      );
    }
  });
});
