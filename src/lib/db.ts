import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@/generated/prisma/client";

// En Vercel, Next empaqueta el cliente generado y Prisma busca su motor en
// carpetas que no existen en la función ("could not locate the Query
// Engine"). next.config.ts copia el motor a la función con
// outputFileTracingIncludes y aquí se le indica a Prisma dónde quedó.
function locateVercelQueryEngine() {
  if (!process.env.VERCEL || process.env.PRISMA_QUERY_ENGINE_LIBRARY) return;
  const dir = path.join(process.cwd(), "src", "generated", "prisma");
  if (!existsSync(dir)) return;
  const engine = readdirSync(dir).find((name) => /^libquery_engine-.+\.so\.node$/.test(name));
  if (engine) process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(dir, engine);
}

locateVercelQueryEngine();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
