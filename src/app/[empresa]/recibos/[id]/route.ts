import { requireStaffSession } from "@/server/http/staff-session";
import { getReceiptUrl } from "@/server/services/cash-movements";

// Recibo de un gasto: el archivo está en el almacenamiento privado, así que
// se valida quién lo pide y se redirige a un enlace firmado que vence al
// minuto. Así la página nunca guarda un enlace que se pueda compartir.
export async function GET(_request: Request, { params }: RouteContext<"/[empresa]/recibos/[id]">) {
  const { empresa, id } = await params;
  const session = await requireStaffSession(empresa);
  let url: string | null;
  try {
    url = await getReceiptUrl(session, id);
  } catch (error) {
    // El almacenamiento no respondió: no es que el recibo no exista.
    console.error("recibos: no se pudo firmar el enlace", (error as Error).message);
    return new Response("No se pudo abrir el recibo. Inténtalo de nuevo en un momento.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (!url) return new Response("Recibo no encontrado", { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { location: url, "cache-control": "no-store" },
  });
}
