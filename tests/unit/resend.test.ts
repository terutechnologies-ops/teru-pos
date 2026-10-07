import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getMailConfig } from "@/server/env";
import { getMessageSender } from "@/server/services/messaging";
import { devOutboxSender } from "@/server/services/messaging/dev-outbox";
import { createResendSender } from "@/server/services/messaging/resend";

const message = { to: "dueno@suarepa.co", subject: "Cierre", text: "Hola" };

function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const env = process.env as Record<string, string | undefined>;
const nodeEnv = env.NODE_ENV;

// Sin clave ni remitente del entorno de quien corre las pruebas.
beforeEach(() => {
  delete env.RESEND_API_KEY;
  delete env.MAIL_FROM;
});
afterEach(() => {
  delete env.RESEND_API_KEY;
  delete env.MAIL_FROM;
  env.NODE_ENV = nodeEnv;
});

describe("createResendSender", () => {
  it("envía a la API de Resend con la clave, el remitente y un destinatario", async () => {
    const { impl, calls } = fakeFetch(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    const sender = createResendSender({ apiKey: "re_secreta", from: "Teru POS <r@envios.x.co>" }, impl);
    await sender.sendEmail(message);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({ Authorization: "Bearer re_secreta" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: "Teru POS <r@envios.x.co>",
      to: ["dueno@suarepa.co"],
      subject: "Cierre",
      text: "Hola",
    });
  });

  it("si Resend rechaza, el error trae el código y el motivo, nunca la clave", async () => {
    const { impl } = fakeFetch(
      new Response(JSON.stringify({ statusCode: 403, message: "The domain is not verified" }), {
        status: 403,
      }),
    );
    const sender = createResendSender({ apiKey: "re_secreta", from: "r@envios.x.co" }, impl);
    const error = await sender.sendEmail(message).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Resend rechazó el correo (403): The domain is not verified");
    expect((error as Error).message).not.toContain("re_secreta");

    const { impl: noBody } = fakeFetch(new Response("bad gateway", { status: 502 }));
    await expect(
      createResendSender({ apiKey: "k", from: "r@envios.x.co" }, noBody).sendEmail(message),
    ).rejects.toThrow("Resend rechazó el correo (502)");
  });
});

describe("configuración del correo", () => {
  it("sin clave: outbox en desarrollo y error claro fuera de él", () => {
    expect(getMailConfig()).toBeNull();
    env.NODE_ENV = "development";
    expect(getMessageSender()).toBe(devOutboxSender);
    env.NODE_ENV = "production";
    expect(() => getMessageSender()).toThrow("No hay proveedor de mensajes configurado");
  });

  it("con clave usa Resend y exige un remitente válido", () => {
    env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_x";
    for (const from of ["Teru POS <reportes@envios.terupos.com>", "reportes@envios.terupos.com"]) {
      process.env.MAIL_FROM = from;
      expect(getMailConfig()).toEqual({ apiKey: "re_x", from });
      expect(getMessageSender()).not.toBe(devOutboxSender);
    }
    for (const from of ["", "Teru POS", "Teru POS <sin-arroba>", "a@b"]) {
      process.env.MAIL_FROM = from;
      expect(() => getMailConfig()).toThrow("MAIL_FROM no está configurado o no es válido");
    }
  });
});
