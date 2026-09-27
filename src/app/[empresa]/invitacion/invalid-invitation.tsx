import Link from "next/link";
import { LinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function InvalidInvitation({ companySlug }: { companySlug: string }) {
  return (
    <div className="space-y-5 text-center" aria-live="polite">
      <div className="flex flex-col items-center gap-3 rounded-xl bg-muted p-5">
        <LinkIcon className="size-8 text-destructive" aria-hidden />
        <p className="text-sm">
          Esta invitación no es válida, ya se usó o venció. Pide a quien te
          invitó que te envíe un enlace nuevo.
        </p>
      </div>
      <Button asChild variant="outline" className="h-12 w-full rounded-xl text-[15px] font-bold">
        <Link href={`/${companySlug}/login`}>Ir a iniciar sesión</Link>
      </Button>
    </div>
  );
}
