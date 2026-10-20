import { database } from "@/lib/auth";
import { getStoreSession } from "@/lib/auth/storeSession";
import { PhotoOrderError, createPhotoOrder, photoOrderSummaryLines, type PhotoOrderInput } from "@/lib/photoOrders/finalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Finaliza o pedido de fotos: precisa de conta (a pasta leva o nome e o número do cliente). */
export async function POST(request: Request) {
  const session = await getStoreSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Entre na sua conta para finalizar." }, { status: 401 });
  try {
    const input = (await request.json()) as PhotoOrderInput;
    const { order, customerNumber, whatsappUrl, prazo } = await createPhotoOrder(database, session.user, input);
    return Response.json({ code: order.code, customerNumber, url: whatsappUrl, summary: photoOrderSummaryLines(order, prazo) });
  } catch (error) {
    if (error instanceof PhotoOrderError) return Response.json({ error: error.message }, { status: 400 });
    console.error("[fotos] pedido falhou", error);
    return Response.json({ error: "Não foi possível montar o pedido agora. Tente de novo." }, { status: 500 });
  }
}
