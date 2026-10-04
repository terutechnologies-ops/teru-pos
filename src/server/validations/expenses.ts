import { displayNameSchema } from "@/server/validations/common";

// Categorías de gasto (configuración de la empresa).
export const expenseCategoryNameSchema = displayNameSchema(40);
