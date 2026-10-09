import "server-only";

import { db } from "@/lib/db";

// Empresas vistas desde el panel del equipo Teru. Solo datos de la empresa
// y cifras agregadas de uso (cuántas ventas, cuánto, cuándo); nunca el
// detalle de ventas, productos ni clientes. Pocas consultas agrupadas en vez
// de una por empresa.

const companySelect = {
  id: true,
  name: true,
  slug: true,
  isActive: true,
  currency: true,
  logoPath: true,
  setupCompletedAt: true,
  createdAt: true,
} as const;

type UsageFilter = { companyId?: string };

// Últimos cambios de estado que muestra la ficha.
export const STATUS_HISTORY_LIMIT = 20;

// Ventas completadas desde `since`, última venta completada y último
// ingreso del personal, por empresa.
async function usageByCompany(since: Date, filter: UsageFilter) {
  const [recent, lastSale, lastLogin, activeUsers, owners] = await Promise.all([
    db.sale.groupBy({
      by: ["companyId"],
      where: { ...filter, status: "COMPLETED", createdAt: { gte: since } },
      _count: true,
      _sum: { total: true },
    }),
    db.sale.groupBy({
      by: ["companyId"],
      where: { ...filter, status: "COMPLETED" },
      _max: { createdAt: true },
    }),
    db.user.groupBy({
      by: ["companyId"],
      where: filter,
      _max: { lastLoginAt: true },
    }),
    db.user.groupBy({
      by: ["companyId"],
      where: { ...filter, isActive: true },
      _count: true,
    }),
    db.user.findMany({
      where: { ...filter, role: "OWNER" },
      orderBy: { createdAt: "asc" },
      select: { companyId: true, name: true, email: true, isActive: true },
    }),
  ]);
  return (companyId: string) => {
    const sales = recent.find((row) => row.companyId === companyId);
    return {
      recentSalesCount: sales?._count ?? 0,
      recentSalesTotal: sales?._sum.total?.toString() ?? "0",
      lastSaleAt: lastSale.find((row) => row.companyId === companyId)?._max.createdAt ?? null,
      lastLoginAt: lastLogin.find((row) => row.companyId === companyId)?._max.lastLoginAt ?? null,
      activeUsers: activeUsers.find((row) => row.companyId === companyId)?._count ?? 0,
      owner: owners.find((row) => row.companyId === companyId) ?? null,
    };
  };
}

export async function listPlatformCompanies(since: Date) {
  const [companies, usage] = await Promise.all([
    db.company.findMany({ orderBy: { name: "asc" }, select: companySelect }),
    usageByCompany(since, {}),
  ]);
  return companies.map((company) => ({ ...company, ...usage(company.id) }));
}

export type PlatformCompanyRow = Awaited<ReturnType<typeof listPlatformCompanies>>[number];

export async function findPlatformCompany(companyId: string, since: Date) {
  const [company, usage, usersByRole, branches, ownerInvitation, openShifts, statusChanges] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: {
        ...companySelect,
        taxId: true,
        phone: true,
        email: true,
        address: true,
        timeZone: true,
        deactivatedAt: true,
        deactivationReason: true,
        deactivatedBy: { select: { name: true } },
      },
    }),
    usageByCompany(since, { companyId }),
    db.user.groupBy({
      by: ["role", "isActive"],
      where: { companyId },
      _count: true,
    }),
    db.branch.count({ where: { companyId } }),
    findPendingOwnerInvitation(companyId),
    db.cashSession.count({ where: { companyId, closedAt: null } }),
    db.companyStatusChange.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: STATUS_HISTORY_LIMIT,
      select: { isActive: true, reason: true, createdAt: true, by: { select: { name: true } } },
    }),
  ]);
  if (!company) return null;
  return {
    ...company,
    ...usage(company.id),
    usersByRole: usersByRole.map((row) => ({ role: row.role, isActive: row.isActive, count: row._count })),
    branches,
    ownerInvitation,
    openShifts,
    statusChanges,
  };
}

// Invitación del propietario sin aceptar ni revocar (puede estar vencida):
// la última, que es la única que sirve.
export async function findPendingOwnerInvitation(companyId: string) {
  return db.staffInvitation.findFirst({
    where: { companyId, role: "OWNER", acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, expiresAt: true },
  });
}

export async function companyHasOwnerAccount(companyId: string) {
  return (await db.user.count({ where: { companyId, role: "OWNER" } })) > 0;
}

export async function isCompanySlugTaken(slug: string) {
  return (await db.company.count({ where: { slug } })) > 0;
}

export async function findCompanyForPlatform(companyId: string) {
  return db.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, slug: true, isActive: true },
  });
}

// --- Desactivar y reactivar ------------------------------------------------

export type CompanyStateChange =
  | { status: "OK"; revokedSessions: number }
  | { status: "NOT_FOUND" }
  | { status: "UNCHANGED" };

// Desactiva y cierra todas las sesiones del personal en una transacción. Su
// login deja de existir (solo se buscan empresas activas); los datos se
// conservan. UNCHANGED si ya estaba desactivada.
export async function deactivateCompany(
  companyId: string,
  input: { reason: string; byId: string },
  now: Date = new Date(),
): Promise<CompanyStateChange> {
  return db.$transaction(async (tx) => {
    const updated = await tx.company.updateMany({
      where: { id: companyId, isActive: true },
      data: {
        isActive: false,
        deactivatedAt: now,
        deactivationReason: input.reason,
        deactivatedById: input.byId,
      },
    });
    if (updated.count === 0) {
      const exists = await tx.company.count({ where: { id: companyId } });
      return { status: exists ? "UNCHANGED" : "NOT_FOUND" } as const;
    }
    await tx.companyStatusChange.create({
      data: { companyId, isActive: false, reason: input.reason, byId: input.byId, createdAt: now },
    });
    const revoked = await tx.userSession.updateMany({
      where: { companyId, revokedAt: null },
      data: { revokedAt: now },
    });
    return { status: "OK", revokedSessions: revoked.count } as const;
  });
}

export async function reactivateCompany(
  companyId: string,
  input: { byId: string },
  now: Date = new Date(),
): Promise<CompanyStateChange> {
  return db.$transaction(async (tx) => {
    const updated = await tx.company.updateMany({
      where: { id: companyId, isActive: false },
      data: { isActive: true, deactivatedAt: null, deactivationReason: null, deactivatedById: null },
    });
    if (updated.count === 0) {
      const exists = await tx.company.count({ where: { id: companyId } });
      return { status: exists ? "UNCHANGED" : "NOT_FOUND" } as const;
    }
    await tx.companyStatusChange.create({
      data: { companyId, isActive: true, byId: input.byId, createdAt: now },
    });
    return { status: "OK", revokedSessions: 0 } as const;
  });
}
