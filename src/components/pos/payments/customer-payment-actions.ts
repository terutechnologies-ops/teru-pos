"use server";

import { refresh } from "next/cache";
import { after } from "next/server";

import { requirePermission } from "@/server/http/staff-session";
import { sendCustomerPaymentEmail } from "@/server/services/customer-payment-email";
import {
  registerCustomerPayment,
  searchPaymentCustomers,
  type PaymentCustomer,
  type RegisterCustomerPaymentResult,
} from "@/server/services/customer-payments";
import type { CustomerPaymentInput } from "@/server/validations/customer-payments";

const FIELDS = ["customerId", "paymentMethodId", "amount", "tendered", "note"] as const;

// Solo los campos esperados y como texto: el servicio valida todo.
function readInput(payload: unknown): CustomerPaymentInput {
  const source = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return Object.fromEntries(
    FIELDS.map((field) => [field, typeof source[field] === "string" ? source[field] : ""]),
  ) as CustomerPaymentInput;
}

// Abono desde el POS. El correo al cliente sale después de responder.
export async function registerCustomerPaymentAction(
  companySlug: string,
  payload: unknown,
): Promise<RegisterCustomerPaymentResult> {
  const session = await requirePermission(companySlug, "sales.charge");
  let result: RegisterCustomerPaymentResult;
  try {
    result = await registerCustomerPayment(session, readInput(payload));
  } catch (error) {
    console.error("registerCustomerPaymentAction: error inesperado", (error as Error).name);
    return {
      ok: false,
      error: "No pudimos registrar el abono. Inténtalo de nuevo en un momento.",
      fieldErrors: {},
    };
  }
  if (result.ok) {
    const { paymentId } = result;
    after(() => sendCustomerPaymentEmail(session.company.id, paymentId));
    // La lista de abonos del turno viene del servidor.
    refresh();
  }
  return result;
}

// Buscador de clientes que deben. null = falló la búsqueda.
export async function searchPaymentCustomersAction(
  companySlug: string,
  search: string,
): Promise<PaymentCustomer[] | null> {
  const session = await requirePermission(companySlug, "sales.charge");
  try {
    return await searchPaymentCustomers(session, typeof search === "string" ? search : "");
  } catch (error) {
    console.error("searchPaymentCustomersAction: error inesperado", (error as Error).name);
    return null;
  }
}
