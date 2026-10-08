// Alta de una empresa nueva: crea la empresa, su sucursal principal y una
// invitación para su propietario, y le envía la bienvenida por correo. Si el
// correo no sale por un proveedor real, muestra el enlace para enviarlo a
// mano.
//
// Uso:
//   npm run company:create -- --name "Mi Negocio" --slug mi-negocio \
//     --owner-name "Ana Pérez" --owner-email ana@correo.com
import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";

import { db } from "@/lib/db";
import { getMailConfig } from "@/server/env";
import { createCompany } from "@/server/services/companies";

// Sin RESEND_API_KEY el correo va al outbox de desarrollo, que vive en la
// memoria de este proceso: nadie lo vería.
function hasMailProvider() {
  try {
    return getMailConfig() !== null;
  } catch {
    return false;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      slug: { type: "string" },
      "owner-name": { type: "string" },
      "owner-email": { type: "string" },
    },
  });

  const result = await createCompany({
    name: values.name ?? "",
    slug: values.slug ?? "",
    ownerName: values["owner-name"] ?? "",
    ownerEmail: values["owner-email"] ?? "",
  });

  console.log(`Empresa ${result.slug} creada con su sucursal principal.`);
  if (result.emailSent && hasMailProvider()) {
    console.log(`Bienvenida enviada a ${result.ownerEmail}.`);
    return;
  }
  console.log(
    result.emailSent
      ? "Sin proveedor de correo: envía el enlace al propietario a mano."
      : "No se pudo enviar la bienvenida: envía el enlace al propietario a mano.",
  );
  console.log(
    `Enlace de invitación del propietario (vence ${result.expiresAt.toISOString()}):`,
  );
  console.log(result.invitationUrl);
}

main()
  .catch((error) => {
    if (error instanceof z.ZodError) {
      console.error(`Datos inválidos:\n${z.prettifyError(error)}`);
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
