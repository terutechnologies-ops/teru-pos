// Next llama a register() una vez al arrancar cada instancia del servidor.
// En producción valida la configuración antes de atender peticiones.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { assertProductionConfig } = await import("@/server/env");
  assertProductionConfig();
}
