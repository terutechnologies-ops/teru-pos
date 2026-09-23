import "server-only";

import { db } from "@/lib/db";

// Único punto que lee passwordHash; el resultado no debe salir de los
// servicios de autenticación.
export async function findUserCredentialsByEmail(
  companyId: string,
  email: string,
) {
  return db.user.findUnique({
    where: { companyId_email: { companyId, email } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
    },
  });
}

export async function markUserLoggedIn(
  userId: string,
  companyId: string,
  now: Date = new Date(),
) {
  await db.user.updateMany({
    where: { id: userId, companyId },
    data: { lastLoginAt: now },
  });
}
