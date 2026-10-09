// Cuentas del equipo Teru (panel /teru). Crea una cuenta o, con --reset,
// le pone una contraseña nueva y cierra todas sus sesiones.
//
// La contraseña sale de TERU_ADMIN_PASSWORD (en .env o en el entorno),
// nunca de la línea de comandos: así no queda en el historial de la consola.
//
// Uso:
//   npm run teru:create-admin -- --name "Ana Pérez" --email ana@teru.com
//   npm run teru:create-admin -- --email ana@teru.com --reset
import "dotenv/config";
import { parseArgs } from "node:util";

import { db } from "@/lib/db";
import {
  createPlatformAdmin,
  resetPlatformAdminPassword,
} from "@/server/services/platform/accounts";

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      email: { type: "string" },
      reset: { type: "boolean", default: false },
    },
  });
  const password = process.env.TERU_ADMIN_PASSWORD ?? "";
  if (!password) throw new Error("Falta la variable TERU_ADMIN_PASSWORD.");
  const email = values.email ?? "";

  if (values.reset) {
    const result = await resetPlatformAdminPassword({ email, password });
    if (!result.ok) throw new Error(result.error);
    console.log(
      `Contraseña de ${email} cambiada. Sesiones cerradas: ${result.revokedSessions}.`,
    );
  } else {
    const result = await createPlatformAdmin({ name: values.name ?? "", email, password });
    if (!result.ok) throw new Error(result.error);
    console.log(`Cuenta del equipo Teru creada para ${email}. Entra por /teru/login.`);
  }
  console.log("Quita TERU_ADMIN_PASSWORD del .env si la pusiste allí.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
