import "server-only";

import { PLATFORM_NAME } from "@/lib/brand";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { getAppUrl } from "@/server/env";
import { STAFF_INVITATION_TTL_MS } from "@/server/services/auth/config";
import { getMessageSender } from "@/server/services/messaging";
import { simpleEmail } from "@/server/services/messaging/email-layout";

// Bienvenida al propietario de una empresa recién creada: lleva el enlace de
// su invitación. Nunca lanza: si falla, el script de alta muestra el enlace
// para enviarlo a mano.
export async function sendOwnerWelcome(params: {
  companyName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  invitationUrl: string;
}): Promise<boolean> {
  try {
    const { companyName, ownerName, ownerEmail, invitationUrl } = params;
    const hours = STAFF_INVITATION_TTL_MS / 3_600_000;
    const role = STAFF_ROLE_LABELS.OWNER;
    const loginUrl = `${getAppUrl()}/${params.slug}/login`;
    const subject = `${companyName} ya tiene su cuenta en ${PLATFORM_NAME}`;
    const paragraphs = [
      `Te damos la bienvenida a ${PLATFORM_NAME}. La cuenta de ${companyName} está lista y tú eres su ${role.toLowerCase()}.`,
      `Usa el botón para crear tu contraseña. El enlace vence en ${hours} horas.`,
      "Al entrar, un asistente te guiará para completar los datos del negocio e invitar a tu equipo.",
    ];
    const note = "Si no esperabas este correo, ignóralo.";

    await getMessageSender().sendEmail({
      to: ownerEmail,
      subject,
      html: simpleEmail({
        title: subject,
        preheader: `Crea tu contraseña para entrar a ${companyName} (el enlace vence en ${hours} horas).`,
        header: { companyName, logoUrl: null, eyebrow: `Bienvenida a ${PLATFORM_NAME}` },
        greeting: `Hola ${ownerName},`,
        paragraphs,
        action: { href: invitationUrl, label: "Crear mi contraseña" },
        details: {
          title: "Tu acceso",
          rows: [
            { label: "Correo", value: ownerEmail },
            { label: "Rol", value: role },
            { label: "Inicio de sesión", value: loginUrl, href: loginUrl },
          ],
        },
        note,
      }),
      text: [
        `Hola ${ownerName},`,
        "",
        ...paragraphs,
        "",
        invitationUrl,
        "",
        "Tu acceso:",
        `- Correo: ${ownerEmail}`,
        `- Rol: ${role}`,
        `- Inicio de sesión: ${loginUrl}`,
        "",
        note,
      ].join("\n"),
    });
    return true;
  } catch (error) {
    console.error("sendOwnerWelcome: envío fallido", (error as Error).name);
    return false;
  }
}
