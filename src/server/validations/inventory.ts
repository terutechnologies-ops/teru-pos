import { displayNameSchema } from "@/server/validations/common";

// Inventario.

export const warehouseNameSchema = displayNameSchema(60);
