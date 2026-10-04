import { db } from "@/lib/db";
import { createMainWarehouse } from "@/server/data/inventory";
import { hashPassword } from "@/server/services/auth/passwords";
import type { StaffRole } from "@/generated/prisma/enums";

// Prefijo único por ejecución: los datos de cada archivo de prueba no
// chocan entre sí y se pueden borrar al terminar.
export function uniqueTag(name: string) {
  return `t-${name}-${Date.now().toString(36)}`;
}

export function ctx(tag: string, ip = "1") {
  return { ipAddress: `${tag}-ip-${ip}`, userAgent: "vitest" };
}

export async function createCompany(slug: string, name = slug) {
  return db.company.create({ data: { name, slug } });
}

// Sucursal principal con su bodega, como las deja el alta de una empresa.
export async function createMainBranch(companyId: string) {
  const branch = await db.branch.create({
    data: { companyId, name: "Sede principal", isMain: true },
  });
  const warehouse = await db.$transaction((tx) => createMainWarehouse(tx, companyId, branch.id));
  return { branchId: branch.id, warehouseId: warehouse.id };
}

export async function createUser(params: {
  companyId: string;
  email: string;
  password?: string;
  role?: StaffRole;
  isActive?: boolean;
  name?: string;
}) {
  return db.user.create({
    data: {
      companyId: params.companyId,
      email: params.email,
      name: params.name ?? "Usuario Prueba",
      role: params.role ?? "STAFF",
      isActive: params.isActive ?? true,
      passwordHash: await hashPassword(params.password ?? "Clave-Segura-1"),
    },
  });
}

// Borra todo lo creado bajo un prefijo de slug (auditoría, invitaciones,
// ventas y caja, compras y terceros, conteos, inventario, catálogo, sucursales, usuarios con sus sesiones y tokens en cascada, y
// empresas).
export async function cleanupCompanies(tag: string) {
  const companies = await db.company.findMany({
    where: { slug: { startsWith: tag } },
    select: { id: true },
  });
  const ids = companies.map((c) => c.id);
  // También por IP con el prefijo: cubre eventos escritos por pruebas que se
  // cortaron por tiempo después de borrar sus empresas.
  await db.authAuditLog.deleteMany({
    where: {
      OR: [{ companyId: { in: ids } }, { ipAddress: { startsWith: tag } }],
    },
  });
  await db.userSession.deleteMany({ where: { companyId: { in: ids } } });
  await db.staffInvitation.deleteMany({ where: { companyId: { in: ids } } });
  await db.productRecipeItem.deleteMany({ where: { companyId: { in: ids } } });
  await db.stockMovement.deleteMany({ where: { companyId: { in: ids } } });
  await db.salePayment.deleteMany({ where: { companyId: { in: ids } } });
  await db.saleLine.deleteMany({ where: { companyId: { in: ids } } });
  await db.sale.deleteMany({ where: { companyId: { in: ids } } });
  await db.purchaseLine.deleteMany({ where: { companyId: { in: ids } } });
  await db.purchase.deleteMany({ where: { companyId: { in: ids } } });
  await db.inventoryCountLine.deleteMany({ where: { companyId: { in: ids } } });
  await db.inventoryCount.deleteMany({ where: { companyId: { in: ids } } });
  await db.thirdParty.deleteMany({ where: { companyId: { in: ids } } });
  await db.cashMovement.deleteMany({ where: { companyId: { in: ids } } });
  await db.expenseCategory.deleteMany({ where: { companyId: { in: ids } } });
  await db.cashSession.deleteMany({ where: { companyId: { in: ids } } });
  await db.paymentMethod.deleteMany({ where: { companyId: { in: ids } } });
  await db.stockLevel.deleteMany({ where: { companyId: { in: ids } } });
  await db.supply.deleteMany({ where: { companyId: { in: ids } } });
  await db.warehouse.deleteMany({ where: { companyId: { in: ids } } });
  await db.product.deleteMany({ where: { companyId: { in: ids } } });
  await db.productCategory.deleteMany({ where: { companyId: { in: ids } } });
  await db.branch.deleteMany({ where: { companyId: { in: ids } } });
  await db.user.deleteMany({ where: { companyId: { in: ids } } });
  await db.company.deleteMany({ where: { id: { in: ids } } });
}
