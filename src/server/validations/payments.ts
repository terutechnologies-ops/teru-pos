import { displayNameSchema } from "@/server/validations/common";

// Métodos de pago (configuración de la empresa).
export const paymentMethodNameSchema = displayNameSchema(40);
