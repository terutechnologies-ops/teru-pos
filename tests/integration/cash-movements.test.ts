import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { StaffRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { createDefaultExpenseCategories, voidCashMovement } from "@/server/data/cash-movements";
import type { StaffSessionDto } from "@/server/dto/auth";
import { ForbiddenError } from "@/server/services/auth/permissions";
import {
  getReceiptUrl,
  getShiftCashMovements,
  registerCashMovement,
} from "@/server/services/cash-movements";
import { closeShift, getClosedShift, openShift } from "@/server/services/cash-sessions";
import { setPrivateFileStorageForTesting } from "@/server/services/storage";
import { createMemoryStorage } from "@/server/services/storage/memory";
import type { CashMovementInput } from "@/server/validations/cash-movements";

import { cleanupCompanies, createCompany, createMainBranch, createUser, uniqueTag } from "../helpers";

const tag = uniqueTag("cashmovsvc");
type Company = { id: string; name: string; slug: string };
let a: Company;
let b: Company;
let ana: StaffSessionDto;
let beto: StaffSessionDto;
let admin: StaffSessionDto;
let gas: string;
let memory: ReturnType<typeof createMemoryStorage>;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const blob = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]);

function sessionFor(company: Company, userId: string, role: StaffRole): StaffSessionDto {
  return {
    sessionId: "s",
    expiresAt: new Date(),
    user: { id: userId, name: "Prueba", email: `${userId}@${tag}.co`, role },
    company: { ...company, setupCompletedAt: new Date(), logoPath: null },
  };
}

async function member(name: string, role: StaffRole) {
  const user = await createUser({ companyId: a.id, email: `${name}@${tag}.co`, role, name });
  return sessionFor(a, user.id, role);
}

const expense = (input: Partial<CashMovementInput> = {}): CashMovementInput => ({
  type: "EXPENSE",
  amount: "5.000",
  categoryId: gas,
  note: "",
  ...input,
});

async function open(session: StaffSessionDto, openingAmount = "100.000") {
  const result = await openShift(session, { branchId: "", openingAmount });
  if (!result.ok) throw new Error(result.error);
  return result.cashSessionId;
}

beforeAll(async () => {
  a = await createCompany(`${tag}-a`);
  b = await createCompany(`${tag}-b`);
  await createMainBranch(a.id);
  await db.$transaction((tx) => createDefaultExpenseCategories(tx, a.id));
  gas = (await db.expenseCategory.findFirstOrThrow({ where: { companyId: a.id, name: "Gas y servicios" } })).id;
  ana = await member("ana", "CASHIER");
  beto = await member("beto", "CASHIER");
  admin = await member("admin", "ADMIN");
});
beforeEach(() => {
  memory = createMemoryStorage();
  setPrivateFileStorageForTesting(memory.storage);
});
afterAll(async () => {
  setPrivateFileStorageForTesting(null);
  await cleanupCompanies(tag);
});

describe("registrar en el POS", () => {
  it("sin turno abierto no hay nada que registrar", async () => {
    expect((await getShiftCashMovements(ana)).shift).toBeNull();
    expect(await registerCashMovement(ana, expense())).toEqual({
      ok: false,
      error: "No tienes un turno abierto. Actualiza la página.",
      fieldErrors: {},
    });
  });

  it("registra los tres tipos y el turno los muestra con sus totales", async () => {
    await open(ana);
    expect(await registerCashMovement(ana, expense({ note: "Pipeta" }))).toEqual({
      ok: true,
      receiptFailed: false,
    });
    // En retiros e ingresos la categoría se ignora.
    expect(await registerCashMovement(ana, expense({ type: "WITHDRAWAL", amount: "50.000" }))).toMatchObject({ ok: true });
    expect(await registerCashMovement(ana, expense({ type: "DEPOSIT", amount: "20000", categoryId: "" }))).toMatchObject({ ok: true });

    const data = await getShiftCashMovements(ana);
    expect(data.categories.map((c) => c.name)[0]).toBe("Domicilios y transporte");
    expect(
      data.movements.map((m) => [m.type, m.amount, m.categoryName, m.note, m.hasReceipt, m.voided]),
    ).toEqual([
      ["EXPENSE", "5000", "Gas y servicios", "Pipeta", false, null],
      ["WITHDRAWAL", "50000", null, null, false, null],
      ["DEPOSIT", "20000", null, null, false, null],
    ]);
    expect(data.totals).toEqual({ expenses: "5000", withdrawals: "50000", deposits: "20000" });
  });

  it("valida monto, categoría y nota", async () => {
    const result = await registerCashMovement(ana, expense({ amount: "0", categoryId: "" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { amount: "El monto debe ser mayor que cero." } });
    expect(await registerCashMovement(ana, expense({ categoryId: "" }))).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: "Elige la categoría del gasto." },
    });
    expect(await registerCashMovement(ana, expense({ type: "OTRO" }))).toMatchObject({
      ok: false,
      fieldErrors: { type: expect.any(String) },
    });
    expect(await registerCashMovement(ana, expense({ note: "x".repeat(201) }))).toMatchObject({
      ok: false,
      fieldErrors: { note: expect.any(String) },
    });
    // Categoría de otra empresa o inactiva.
    expect(await registerCashMovement(ana, expense({ categoryId: "ajena" }))).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: "Esa categoría ya no está disponible. Elige otra." },
    });
    expect((await getShiftCashMovements(ana)).movements).toHaveLength(3);
  });
});

describe("foto del recibo", () => {
  it("se guarda en el almacenamiento privado y la ven el dueño y quien revisa", async () => {
    expect(await registerCashMovement(ana, expense({ amount: "1.000" }), blob(PNG))).toEqual({
      ok: true,
      receiptFailed: false,
    });
    const movement = (await getShiftCashMovements(ana)).movements.at(-1)!;
    expect(movement.hasReceipt).toBe(true);
    const row = await db.cashMovement.findUniqueOrThrow({ where: { id: movement.id } });
    expect(row.receiptPath).toMatch(new RegExp(`^companies/${a.id}/receipts/${movement.id}-.+\\.png$`));
    expect(memory.files.has(row.receiptPath!)).toBe(true);

    expect(await getReceiptUrl(ana, movement.id)).toBe(
      `memory-signed://${row.receiptPath}?expiresIn=60`,
    );
    expect(await getReceiptUrl(admin, movement.id)).toMatch(/^memory-signed:/);
    // Otro cajero, otra empresa o personal sin permiso: no.
    expect(await getReceiptUrl(beto, movement.id)).toBeNull();
    expect(await getReceiptUrl(sessionFor(b, admin.user.id, "ADMIN"), movement.id)).toBeNull();
    expect(await getReceiptUrl(sessionFor(a, ana.user.id, "STAFF"), movement.id)).toBeNull();
  });

  it("una foto inválida no registra nada; en un retiro se ignora", async () => {
    const before = (await getShiftCashMovements(ana)).movements.length;
    expect(
      await registerCashMovement(ana, expense(), blob(new TextEncoder().encode("no es imagen"))),
    ).toMatchObject({ ok: false, fieldErrors: { image: "Usa una imagen PNG, JPG o WebP." } });
    expect((await getShiftCashMovements(ana)).movements).toHaveLength(before);

    expect(
      await registerCashMovement(ana, expense({ type: "WITHDRAWAL" }), blob(PNG)),
    ).toEqual({ ok: true, receiptFailed: false });
    expect((await getShiftCashMovements(ana)).movements.at(-1)!.hasReceipt).toBe(false);
  });

  it("si solo falla la subida, el gasto queda sin foto", async () => {
    setPrivateFileStorageForTesting({
      ...memory.storage,
      upload: async () => {
        throw new Error("Storage caído");
      },
    });
    expect(await registerCashMovement(ana, expense(), blob(PNG))).toEqual({
      ok: true,
      receiptFailed: true,
    });
    expect((await getShiftCashMovements(ana)).movements.at(-1)!.hasReceipt).toBe(false);

    // Sin almacenamiento configurado, la foto se rechaza antes de registrar.
    setPrivateFileStorageForTesting(null);
    expect(await registerCashMovement(ana, expense(), blob(PNG))).toMatchObject({
      ok: false,
      fieldErrors: { image: "No hay almacenamiento de archivos configurado." },
    });
  });
});

describe("cierre y resultado del turno", () => {
  it("el cuadre del turno cerrado incluye los movimientos (sin los anulados)", async () => {
    const shift = await open(beto, "50.000");
    await registerCashMovement(beto, expense({ amount: "10.000" }));
    await registerCashMovement(beto, expense({ type: "DEPOSIT", amount: "5.000" }));
    await registerCashMovement(beto, expense({ type: "WITHDRAWAL", amount: "20.000" }));
    const voided = (await getShiftCashMovements(beto)).movements[0].id;
    await voidCashMovement(a.id, { movementId: voided, userId: admin.user.id, reason: "Repetido" });
    await registerCashMovement(beto, expense({ amount: "3.000" }));

    // 50.000 + 5.000 − 20.000 − 3.000
    expect(await closeShift(beto, { countedCash: "32.000", closingNote: "" })).toEqual({
      ok: true,
      cashSessionId: shift,
    });
    const closed = await getClosedShift(beto, shift);
    expect(closed?.shift).toMatchObject({
      expectedCash: "32000",
      difference: "0",
      cash: { sales: "0", deposits: "5000", expenses: "3000", withdrawals: "20000" },
    });
    // Cerrado, ya no se registra nada.
    expect(await registerCashMovement(beto, expense())).toMatchObject({ ok: false });
  });
});

describe("permisos", () => {
  it("el personal no registra movimientos", async () => {
    const staff = sessionFor(a, ana.user.id, "STAFF");
    await expect(getShiftCashMovements(staff)).rejects.toThrow(ForbiddenError);
    await expect(registerCashMovement(staff, expense())).rejects.toThrow(ForbiddenError);
  });
});
