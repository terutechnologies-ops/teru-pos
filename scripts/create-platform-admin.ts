// Cuentas del equipo Teru (panel /teru): crear una cuenta, cambiarle la
// contraseña (--reset), o quitarle o devolverle el acceso (--deactivate /
// --activate). --reset y --deactivate cierran todas sus sesiones.
//
// La contraseña sale de TERU_ADMIN_PASSWORD (en .env o en el entorno),
// nunca de la línea de comandos: así no queda en el historial de la consola.
//
// Uso:
//   npm run teru:create-admin -- --name "Ana Pérez" --email ana@teru.com
//   npm run teru:create-admin -- --email ana@teru.com --reset
//   npm run teru:create-admin -- --email ana@teru.com --deactivate
//   npm run teru:create-admin -- --email ana@teru.com --activate
import "dotenv/config";
import { parseArgs } from "node:util";

import { db } from "@/lib/db";
import {
  createPlatformAdmin,
  resetPlatformAdminPassword,
  setPlatformAdminActive,
} from "@/server/services/platform/accounts";

function requirePassword() {
  const password = process.env.TERU_ADMIN_PASSWORD ?? "";
  if (!password) throw new Error("Falta la variable TERU_ADMIN_PASSWORD.");
  return password;
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      email: { type: "string" },
      reset: { type: "boolean", default: false },
      deactivate: { type: "boolean", default: false },
      activate: { type: "boolean", default: false },
    },
  });
  const email = values.email ?? "";
  const modes = [values.reset, values.deactivate, values.activate].filter(Boolean).length;
  if (modes > 1) throw new Error("Usa solo una de --reset, --deactivate o --activate.");

  if (values.deactivate || values.activate) {
    const result = await setPlatformAdminActive({ email, active: values.activate });
    if (!result.ok) throw new Error(result.error);
    console.log(
      values.activate
        ? `Cuenta ${email} activada.`
        : `Cuenta ${email} desactivada. Sesiones cerradas: ${result.revokedSessions}.`,
    );
    return;
  }

  const password = requirePassword();
  if (values.reset) {
    const result = await resetPlatformAdminPassword({ email, password });
    if (!result.ok) throw new Error(result.error);
    console.log(`Contraseña de ${email} cambiada. Sesiones cerradas: ${result.revokedSessions}.`);
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
