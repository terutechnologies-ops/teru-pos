import "server-only";

import {
  claimClosingReport,
  findClosingReportPeriod,
  finishClosingReport,
  type ClosingReportClaim,
} from "@/server/data/closing-reports";
import {
  findClosingReportEmails,
  findCompanyFormats,
  findCompanySettings,
} from "@/server/data/companies";
import { getAppUrl } from "@/server/env";
import { buildClosingReportEmail } from "@/server/services/closing-report-email";
import { publicFileUrl } from "@/server/services/images";
import { getMessageSender } from "@/server/services/messaging";
import { loadShoppingList } from "@/server/services/shopping-list";

// Reporte de cierre del día: al cerrar el último turno abierto de la
// empresa se envía a los destinatarios de Configuración > Negocio la lista
// de compras y el resumen de los turnos cerrados desde el reporte anterior
// (el correo se arma en closing-report-email.ts). Lo dispara el sistema
// (después de responder al cierre), no una persona: no pide permisos y
// nunca hace fallar el cierre.

async function composeClosingReport(companyId: string, claim: ClosingReportClaim) {
  const [company, formats, shopping, period] = await Promise.all([
    findCompanySettings(companyId),
    findCompanyFormats(companyId),
    loadShoppingList(companyId),
    findClosingReportPeriod(companyId, claim),
  ]);
  if (!company) throw new Error("Empresa no encontrada");
  return buildClosingReportEmail({
    ...formats,
    companyName: company.name,
    logoUrl: publicFileUrl(company.logoPath),
    companyUrl: `${getAppUrl()}/${company.slug}`,
    cutoff: claim.cutoff,
    shopping,
    period,
  });
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message || error.name : "Error desconocido";
}

export type ClosingReportOutcome = "SENT" | "FAILED" | "SKIPPED" | null;

// Después de cerrar un turno: si era el último abierto, reserva el reporte y
// lo envía a cada destinatario por separado. null = no correspondía (quedan
// turnos abiertos o ya se reportó). Nunca lanza: los errores quedan en el
// reporte o en el log.
export async function sendClosingReportIfLast(
  companyId: string,
  cashSessionId: string,
): Promise<ClosingReportOutcome> {
  try {
    const recipients = await findClosingReportEmails(companyId);
    const claim = await claimClosingReport(companyId, {
      cashSessionId,
      recipientCount: recipients.length,
    });
    if (!claim) return null;
    if (recipients.length === 0) return "SKIPPED";

    let sentCount = 0;
    let error: string | null = null;
    try {
      const email = await composeClosingReport(companyId, claim);
      const sender = getMessageSender();
      for (const to of recipients) {
        try {
          await sender.sendEmail({ to, ...email });
          sentCount += 1;
        } catch (sendError) {
          error ??= describeError(sendError);
        }
      }
    } catch (composeError) {
      error = describeError(composeError);
    }
    const status = sentCount === recipients.length ? "SENT" : "FAILED";
    await finishClosingReport(companyId, claim.id, { status, sentCount, error });
    if (status === "FAILED") console.error("sendClosingReportIfLast: envío fallido", error);
    return status;
  } catch (error) {
    console.error("sendClosingReportIfLast: error inesperado", (error as Error).name);
    return null;
  }
}
