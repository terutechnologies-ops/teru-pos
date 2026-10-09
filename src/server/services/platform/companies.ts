import "server-only";

import {
  DEFAULT_TIME_ZONE,
  formatCalendarDate,
  formatDateTime,
  formatMoney,
} from "@/lib/company-formats";
import {
  findPlatformCompany,
  listPlatformCompanies,
  type PlatformCompanyRow,
} from "@/server/data/platform-companies";
import { publicFileUrl } from "@/server/services/images";
import type { PlatformSessionDto } from "@/server/services/platform/auth";

// Empresas de la plataforma para el panel del equipo Teru. Cada función pide
// la sesión Teru (la página ya la validó; así ningún otro código puede
// llamarlas sin ella). Fechas en la hora de Colombia, donde está el equipo.

export const PLATFORM_USAGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CompanyStatus = "ACTIVE" | "SETUP_PENDING" | "INACTIVE";

function assertPlatformSession(session: PlatformSessionDto) {
  if (!session?.user?.id) throw new Error("Se requiere una sesión del equipo Teru");
}

function when(date: Date | null) {
  return date ? formatDateTime(date, "DD/MM/YYYY", DEFAULT_TIME_ZONE) : null;
}

function toCompanySummary(row: PlatformCompanyRow) {
  const status: CompanyStatus = !row.isActive
    ? "INACTIVE"
    : row.setupCompletedAt
      ? "ACTIVE"
      : "SETUP_PENDING";
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status,
    logoUrl: publicFileUrl(row.logoPath),
    createdOn: formatCalendarDate(row.createdAt, "DD/MM/YYYY", DEFAULT_TIME_ZONE),
    owner: row.owner,
    activeUsers: row.activeUsers,
    recentSalesCount: row.recentSalesCount,
    recentSalesTotal: formatMoney(Number(row.recentSalesTotal), row.currency),
    lastSaleAt: when(row.lastSaleAt),
    lastLoginAt: when(row.lastLoginAt),
  };
}

export type PlatformCompanySummary = ReturnType<typeof toCompanySummary>;

export async function getPlatformCompanies(session: PlatformSessionDto, now = new Date()) {
  assertPlatformSession(session);
  const rows = await listPlatformCompanies(new Date(now.getTime() - PLATFORM_USAGE_DAYS * DAY_MS));
  const companies = rows.map(toCompanySummary);
  return {
    companies,
    counts: {
      total: companies.length,
      active: companies.filter((c) => c.status === "ACTIVE").length,
      setupPending: companies.filter((c) => c.status === "SETUP_PENDING").length,
      inactive: companies.filter((c) => c.status === "INACTIVE").length,
      // Activas con al menos una venta en el período.
      selling: companies.filter((c) => c.status !== "INACTIVE" && c.recentSalesCount > 0).length,
    },
  };
}

export async function getPlatformCompany(
  session: PlatformSessionDto,
  companyId: string,
  now = new Date(),
) {
  assertPlatformSession(session);
  if (!companyId || companyId.length > 64) return null;
  const row = await findPlatformCompany(companyId, new Date(now.getTime() - PLATFORM_USAGE_DAYS * DAY_MS));
  if (!row) return null;
  return {
    ...toCompanySummary(row),
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    address: row.address,
    currency: row.currency,
    timeZone: row.timeZone,
    setupCompletedAt: when(row.setupCompletedAt),
    branches: row.branches,
    usersByRole: row.usersByRole,
  };
}

export type PlatformCompanyDetail = NonNullable<Awaited<ReturnType<typeof getPlatformCompany>>>;
