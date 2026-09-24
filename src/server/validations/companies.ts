import { z } from "zod";

import { companySlugSchema, emailSchema } from "@/server/validations/auth";

const nameSchema = z.string().trim().min(2).max(120);

// Alta de empresa por script de soporte (no hay registro público).
export const createCompanySchema = z.object({
  name: nameSchema,
  slug: companySlugSchema,
  ownerName: nameSchema,
  ownerEmail: emailSchema,
});

export type CreateCompanyInput = z.input<typeof createCompanySchema>;
