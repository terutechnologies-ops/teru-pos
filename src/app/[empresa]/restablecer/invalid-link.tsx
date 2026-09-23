import Link from "next/link";
import { LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InvalidLink({ companySlug }: { companySlug: string }) {
  return (
    <div className="space-y-5 text-center" aria-live="polite">
      <div className="flex flex-col items-center gap-3 rounded-lg bg-muted p-5">
        <LinkIcon className="size-8 text-destructive" aria-hidden />
        <p className="text-sm">
          Este enlace no es válido o ya venció. Los enlaces sirven una sola vez
          y duran 20 minutos.
        </p>
      </div>
      <Button asChild className="h-12 w-full text-[15px] font-bold">
        <Link href={`/${companySlug}/recuperar`}>Solicitar un nuevo enlace</Link>
      </Button>
    </div>
  );
}
