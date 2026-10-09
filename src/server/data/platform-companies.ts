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
  const [company, usage, usersByRole, branches, ownerInvitation] = await Promise.all([
    db.company.findUnique({
      where: { id: companyId },
      select: {
        ...companySelect,
        taxId: true,
        phone: true,
        email: true,
        address: true,
        timeZone: true,
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
  ]);
  if (!company) return null;
  return {
    ...company,
    ...usage(company.id),
    usersByRole: usersByRole.map((row) => ({ role: row.role, isActive: row.isActive, count: row._count })),
    branches,
    ownerInvitation,
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
