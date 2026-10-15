"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, KeyRound, Printer, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Campos y avisos del segundo paso del ingreso del equipo Teru.

const fieldClass =
  "h-12 rounded-xl border-2 border-input bg-card pl-11 text-base shadow-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20";

// Código de 6 dígitos de la app: el navegador del celular puede sugerirlo.
export function TotpCodeField({ id = "code" }: { id?: string }) {
  return (
    <div className="relative flex items-center">
      <KeyRound className="pointer-events-none absolute left-4 size-5 text-muted-foreground" aria-hidden />
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        placeholder="123456"
        required
        autoFocus
        className={`${fieldClass} font-mono tracking-[0.4em]`}
      />
    </div>
  );
}

export function RecoveryCodeField({ id = "recoveryCode" }: { id?: string }) {
  return (
    <div className="relative flex items-center">
      <KeyRound className="pointer-events-none absolute left-4 size-5 text-muted-foreground" aria-hidden />
      <Input
        id={id}
        name="recoveryCode"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        placeholder="ABCDE-23456"
        required
        autoFocus
        className={`${fieldClass} font-mono tracking-wider uppercase`}
      />
    </div>
  );
}

export function MfaError({ message, restart }: { message: string; restart: boolean }) {
  return (
    <Alert variant="destructive" aria-live="polite">
      <TriangleAlert />
      <AlertDescription>
        {message}
        {restart && (
          <>
            {" "}
            <Link href="/teru/login" className="font-semibold underline">
              Volver al ingreso
            </Link>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

// Códigos de respaldo recién creados: se muestran una sola vez.
export function RecoveryCodesList({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-2 gap-2 rounded-xl border-2 border-dashed border-border bg-muted/50 p-4 font-mono text-sm font-semibold tracking-wider">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex gap-2 print:hidden">
        <Button type="button" variant="outline" className="flex-1 gap-2" onClick={copy}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copiados" : "Copiar"}
        </Button>
        <Button type="button" variant="outline" className="flex-1 gap-2" onClick={() => window.print()}>
          <Printer aria-hidden />
          Imprimir
        </Button>
      </div>
    </div>
  );
}
