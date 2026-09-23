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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-10">
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
            <CardContent>
              <pre className="font-sans text-sm break-all whitespace-pre-wrap">
                {m.text}
              </pre>
            </CardContent>
          </Card>
        ))
      )}
    </main>
  );
}
