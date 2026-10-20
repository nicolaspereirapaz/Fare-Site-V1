import { database } from "@/lib/auth";
import { PhotoOrderError } from "@/lib/photoOrders/finalize";
import { photoLinkView, submitPhotoLink } from "@/lib/photoLinks/links";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

/** Link das fotos (sem conta: o endereço secreto é a autorização). GET: o que o cliente vê. POST: envio das fotos. */
export async function GET(_request: Request, context: Context) {
  const view = photoLinkView(database, (await context.params).token);
  return view ? Response.json(view) : Response.json({ error: "Link não encontrado. Peça um novo à loja." }, { status: 404 });
}

export async function POST(request: Request, context: Context) {
  try {
    const body = (await request.json()) as { photos?: unknown };
    const result = await submitPhotoLink(database, (await context.params).token, body.photos);
    return Response.json({ code: result.code, totalCents: result.totalCents });
  } catch (error) {
    if (error instanceof PhotoOrderError) return Response.json({ error: error.message }, { status: 400 });
    console.error("[fotos] envio pelo link falhou", error);
    return Response.json({ error: "Não foi possível enviar agora. Tente de novo." }, { status: 500 });
  }
}
