import { db } from "@/lib/db";
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
// sucursales, usuarios con sus sesiones y tokens en cascada, y empresas).
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
  await db.branch.deleteMany({ where: { companyId: { in: ids } } });
  await db.user.deleteMany({ where: { companyId: { in: ids } } });
  await db.company.deleteMany({ where: { id: { in: ids } } });
}
