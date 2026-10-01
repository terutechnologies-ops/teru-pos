import "server-only";

import type { RequestContext, StaffSessionDto } from "@/server/dto/auth";
import { recordAuthEvent } from "@/server/data/auth-audit";
import {
  createPaymentMethod as insertPaymentMethod,
  listPaymentMethods,
  movePaymentMethod as reorderPaymentMethod,
  renamePaymentMethod as updatePaymentMethodName,
  setPaymentMethodActive as updatePaymentMethodActive,
  type PaymentMethodWriteStatus,
} from "@/server/data/payment-methods";
import { PAYMENT_METHOD_EVENTS } from "@/server/services/auth/config";
import { assertPermission } from "@/server/services/auth/permissions";
import { paymentMethodNameSchema } from "@/server/validations/payments";

// Métodos de pago de la empresa, con payments.manage. El orden de la lista
// es el orden en que se ofrecen al cobrar.

export type PaymentMethodResult = { ok: true } | { ok: false; error: string };

const METHOD_GONE = "El método de pago ya no existe. Actualiza la página.";

const WRITE_ERRORS: Record<Exclude<PaymentMethodWriteStatus, "OK">, string> = {
  NOT_FOUND: METHOD_GONE,
  NAME_TAKEN: "Ya existe un método de pago con ese nombre.",
  IS_CASH: "El efectivo es del sistema: no se renombra ni se desactiva.",
};

function parseName(input: unknown) {
  const parsed = paymentMethodNameSchema.safeParse(input);
  return parsed.success
    ? { ok: true as const, name: parsed.data }
    : { ok: false as const, error: parsed.error.issues[0].message };
}

async function audit(
  session: StaffSessionDto,
  action: string,
  paymentMethodId: string,
  ctx: RequestContext,
) {
  await recordAuthEvent({
    companyId: session.company.id,
    actorType: "STAFF",
    actorId: session.user.id,
    action,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    target: { type: "PAYMENT_METHOD", id: paymentMethodId },
  });
}

export async function getPaymentMethods(session: StaffSessionDto) {
  assertPermission(session, "payments.manage");
  return listPaymentMethods(session.company.id);
}

export type PaymentMethodOverview = Awaited<ReturnType<typeof getPaymentMethods>>[number];

export async function createPaymentMethod(
  session: StaffSessionDto,
  name: unknown,
  ctx: RequestContext,
): Promise<PaymentMethodResult> {
  assertPermission(session, "payments.manage");
  const parsed = parseName(name);
  if (!parsed.ok) return parsed;
  const { status, id } = await insertPaymentMethod(session.company.id, parsed.name);
  if (status !== "OK" || !id) return { ok: false, error: WRITE_ERRORS[status === "OK" ? "NOT_FOUND" : status] };
  await audit(session, PAYMENT_METHOD_EVENTS.CREATED, id, ctx);
  return { ok: true };
}

export async function renamePaymentMethod(
  session: StaffSessionDto,
  paymentMethodId: string,
  name: unknown,
  ctx: RequestContext,
): Promise<PaymentMethodResult> {
  assertPermission(session, "payments.manage");
  const parsed = parseName(name);
  if (!parsed.ok) return parsed;
  const status = await updatePaymentMethodName(session.company.id, paymentMethodId, parsed.name);
  if (status !== "OK") return { ok: false, error: WRITE_ERRORS[status] };
  await audit(session, PAYMENT_METHOD_EVENTS.RENAMED, paymentMethodId, ctx);
  return { ok: true };
}

export async function setPaymentMethodActive(
  session: StaffSessionDto,
  paymentMethodId: string,
  isActive: boolean,
  ctx: RequestContext,
): Promise<PaymentMethodResult> {
  assertPermission(session, "payments.manage");
  const status = await updatePaymentMethodActive(session.company.id, paymentMethodId, isActive);
  if (status !== "OK") return { ok: false, error: WRITE_ERRORS[status] };
  await audit(
    session,
    isActive ? PAYMENT_METHOD_EVENTS.ACTIVATED : PAYMENT_METHOD_EVENTS.DEACTIVATED,
    paymentMethodId,
    ctx,
  );
  return { ok: true };
}

export async function movePaymentMethod(
  session: StaffSessionDto,
  paymentMethodId: string,
  direction: "up" | "down",
): Promise<PaymentMethodResult> {
  assertPermission(session, "payments.manage");
  const moved = await reorderPaymentMethod(session.company.id, paymentMethodId, direction);
  return moved
    ? { ok: true }
    : { ok: false, error: "No se pudo mover el método de pago. Actualiza la página." };
}
