import "server-only";

import argon2 from "argon2";

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Hash corrupto o con formato inválido: se trata como no coincidente.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Cuando el usuario no existe se verifica contra un hash ficticio para que
// el tiempo de respuesta no revele qué correos están registrados.
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
}
