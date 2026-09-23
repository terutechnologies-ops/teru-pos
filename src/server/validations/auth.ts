import { z } from "zod";

export const companySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(64);

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  // Sin reglas de complejidad al entrar: esas aplican al crear o cambiar la
  // contraseña. El máximo evita hashear entradas enormes.
  password: z.string().min(1).max(200),
  remember: z.boolean().default(false),
});

export type StaffLoginInput = z.input<typeof staffLoginSchema>;
