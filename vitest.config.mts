import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lanza error fuera de React Server Components; en las
      // pruebas se reemplaza por un módulo vacío.
      "server-only": fileURLToPath(
        new URL("./tests/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/setup.ts"],
          // Comparten la BD de pruebas.
          fileParallelism: false,
          // Holgado: desde fuera de sa-east-1 cada consulta tarda ~0,8 s.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
