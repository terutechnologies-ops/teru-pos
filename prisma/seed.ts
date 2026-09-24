// Datos iniciales: la empresa Su Arepa, su sucursal principal y su usuario
// propietario.
// Idempotente: si ya existen, no los modifica (nunca pisa una contraseña).
//
// Uso: SEED_OWNER_EMAIL, SEED_OWNER_NAME y SEED_OWNER_PASSWORD en .env,
// luego `npm run db:seed`.
import "dotenv/config";

import { db } from "@/lib/db";
import { MAIN_BRANCH_NAME } from "@/server/data/companies";
import { hashPassword } from "@/server/services/auth/passwords";
import {
  companySlugSchema,
  PASSWORD_MIN_LENGTH,
} from "@/server/validations/auth";

const COMPANY = { name: "Su Arepa", slug: "su-arepa" };

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

async function main() {
  const email = requiredEnv("SEED_OWNER_EMAIL").toLowerCase();
  const name = requiredEnv("SEED_OWNER_NAME");
  const password = requiredEnv("SEED_OWNER_PASSWORD");
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `SEED_OWNER_PASSWORD debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    );
  }

  const slug = companySlugSchema.parse(COMPANY.slug);
  const company = await db.company.upsert({
    where: { slug },
    update: {},
    create: { name: COMPANY.name, slug },
  });
  await db.branch.upsert({
    where: { companyId_name: { companyId: company.id, name: MAIN_BRANCH_NAME } },
    update: {},
    create: { companyId: company.id, name: MAIN_BRANCH_NAME, isMain: true },
  });

  const existing = await db.user.findUnique({
    where: { companyId_email: { companyId: company.id, email } },
    select: { id: true },
  });
  if (existing) {
    console.log(`El usuario ${email} ya existe en ${slug}; no se modificó.`);
  } else {
    await db.user.create({
      data: {
        companyId: company.id,
        email,
        name,
        role: "OWNER",
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`Usuario OWNER ${email} creado en ${slug}.`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
