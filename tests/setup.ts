import { config } from "dotenv";

// Las pruebas usan solo .env.test (proyecto Supabase su-arepa-test).
config({ path: ".env.test", override: true, quiet: true });

const DEV_PROJECT_REF = "icecyozrwddieqshjaga";
const url = process.env.DATABASE_URL ?? "";

if (!url) {
  throw new Error("Falta .env.test con DATABASE_URL de la BD de pruebas.");
}
// Protección: nunca correr pruebas contra la BD de desarrollo.
if (url.includes(DEV_PROJECT_REF)) {
  throw new Error("DATABASE_URL de .env.test apunta a la BD de desarrollo.");
}

// El outbox de desarrollo es el proveedor de mensajes en las pruebas.
(process.env as Record<string, string>).NODE_ENV = "development";
