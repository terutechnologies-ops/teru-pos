import "server-only";

import { formatCalendarDate, formatClock } from "@/lib/company-formats";
import { findCompanyFormats, findCompanySettings } from "@/server/data/companies";
import { findUserContact } from "@/server/data/users";
import { getAppUrl } from "@/server/env";
import { publicFileUrl } from "@/server/services/images";
import { getMessageSender } from "@/server/services/messaging";
import { simpleEmail } from "@/server/services/messaging/email-layout";

// Aviso de seguridad a la persona cuando su contraseña cambia, desde "Mi
// cuenta" o con un enlace de recuperación. Si no fue ella, el botón la lleva
// a recuperar la contraseña. Se envía después de guardar el cambio y nunca
// lanza: un fallo del correo no deshace ni bloquea el cambio.

export type PasswordChangeVia = "ACCOUNT" | "RESET_LINK";

const VIA = {
  ACCOUNT: {
    label: "Desde Mi cuenta",
    sessions: "Se cerraron tus demás sesiones abiertas.",
  },
  RESET_LINK: {
    label: "Con un enlace de recuperación",
    sessions: "Se cerraron todas tus sesiones abiertas.",
  },
} as const;

export async function sendPasswordChangedNotice(params: {
  companyId: string;
  userId: string;
  via: PasswordChangeVia;
  at?: Date;
}): Promise<boolean> {
  try {
    const [company, formats, user] = await Promise.all([
      findCompanySettings(params.companyId),
      findCompanyFormats(params.companyId),
      findUserContact(params.companyId, params.userId),
    ]);
    if (!company || !user) return false;

    const at = params.at ?? new Date();
    const date = formatCalendarDate(at, formats.dateFormat, formats.timeZone);
    // Espacios duros: "8:47 p. m." no se parte entre líneas.
    const time = formatClock(at, formats.timeZone).replace(/ /g, "\u00a0");
    const via = VIA[params.via];
    const recoverUrl = `${getAppUrl()}/${company.slug}/recuperar`;
    const subject = `Tu contraseña de ${company.name} cambió`;
    // La hora va en medio: termina en "p. m." y cerraría con doble punto.
    const changed = `El ${date} a las ${time} se cambió la contraseña de tu cuenta en ${company.name}.`;
    const ifYou = "Si fuiste tú, no tienes que hacer nada.";
    const ifNotYou = `Si no fuiste tú, recupera tu contraseña de inmediato y avisa al administrador de ${company.name}.`;

    await getMessageSender().sendEmail({
      to: user.email,
      subject,
      html: simpleEmail({
        title: subject,
        preheader: `${changed} ${ifYou}`,
        header: {
          companyName: company.name,
          logoUrl: publicFileUrl(company.logoPath),
          eyebrow: "Aviso de seguridad",
        },
        greeting: `Hola ${user.name},`,
        paragraphs: [`${changed} ${via.sessions}`, ifYou],
        action: { href: recoverUrl, label: "No fui yo: recuperar contraseña" },
        details: {
          title: "Detalles del cambio",
          rows: [
            { label: "Cuenta", value: user.email },
            { label: "Fecha", value: `${date} ${time}` },
            { label: "Cómo", value: via.label },
          ],
        },
        note: ifNotYou,
      }),
      text: [
        `Hola ${user.name},`,
        "",
        `${changed} ${via.sessions}`,
        ifYou,
        "",
        `- Cuenta: ${user.email}`,
        `- Cómo: ${via.label}`,
        "",
        ifNotYou,
        recoverUrl,
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("sendPasswordChangedNotice: envío fallido", (error as Error).name);
    return false;
  }
}
