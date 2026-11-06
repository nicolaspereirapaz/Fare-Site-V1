import { database } from "@/lib/auth";
import { PhotoOrderError } from "@/lib/photoOrders/finalize";
import { reopenPhotoLink } from "@/lib/photoLinks/links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

/**
 * "Alterar fotos": devolve as fotos do envio anterior deste link (cada uma como um envio novo, com os ajustes
 * de antes) para o editor. Sem conta: o endereço secreto do link é a autorização, como no GET/POST do link.
 */
export async function POST(_request: Request, context: Context) {
  try {
    return Response.json(await reopenPhotoLink(database, (await context.params).token));
  } catch (error) {
    if (error instanceof PhotoOrderError) return Response.json({ error: error.message }, { status: 400 });
    console.error("[fotos] reabrir o link falhou", error);
    return Response.json({ error: "Não foi possível abrir as fotos enviadas agora. Tente de novo." }, { status: 500 });
  }
}
