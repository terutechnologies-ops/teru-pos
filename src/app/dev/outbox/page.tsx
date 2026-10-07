import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isDevOutboxEnabled } from "@/server/services/messaging";
import { listDevOutbox } from "@/server/services/messaging/dev-outbox";

export const metadata: Metadata = {
  title: "Bandeja de desarrollo",
  robots: { index: false },
};

// Solo en desarrollo: muestra los correos que en producción enviaría el
// proveedor real. Fuera de development responde 404.
export default function DevOutboxPage() {
  if (!isDevOutboxEnabled()) notFound();
  const messages = listDevOutbox();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-10">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Bandeja de desarrollo
        </h1>
        <p className="text-sm text-muted-foreground">
          Mensajes enviados desde que arrancó el servidor (máx. 50, en
          memoria).
        </p>
      </div>
      {messages.length === 0 ? (
        <p className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
          No hay mensajes todavía.
        </p>
      ) : (
        messages.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>{m.subject}</CardTitle>
              <CardDescription>
                Para {m.to} · {m.sentAt.toLocaleString("es-CO")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Vista del HTML en un marco aislado (sandbox sin permisos:
                  sin scripts ni navegación). */}
              {m.html && (
                <iframe
                  title={`Vista del correo: ${m.subject}`}
                  srcDoc={m.html}
                  sandbox=""
                  className="h-[640px] w-full rounded-lg border border-border bg-white"
                />
              )}
              <details open={!m.html}>
                <summary className="cursor-pointer text-sm font-semibold">
                  Texto plano
                </summary>
                <pre className="mt-2 font-sans text-sm break-all whitespace-pre-wrap">
                  {m.text}
                </pre>
              </details>
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}
