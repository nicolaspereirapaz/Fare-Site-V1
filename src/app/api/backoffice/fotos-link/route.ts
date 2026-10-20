import { database } from "@/lib/auth";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { orderCode } from "@/lib/orders/orderCode";
import { findOrderById } from "@/lib/orders/repository";
import { createPhotoLink, type PhotoLinkKind } from "@/lib/photoLinks/links";
import { findQuoteById, quoteCode } from "@/lib/quotes/repository";
import { NO_CUSTOMER_NAME } from "@/lib/quotes/quoteCode";
import { getStaffSession } from "@/lib/staff/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Equipe gera o link das fotos de um orçamento/pedido: devolve o endereço e a mensagem pronta do WhatsApp. */
export async function POST(request: Request) {
  const session = await getStaffSession(request.headers);
  if (!session) return Response.json({ error: "Entre na área da equipe." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { kind?: PhotoLinkKind; id?: string };
  const id = String(body.id ?? "");
  const doc = body.kind === "quote" ? findQuoteById(database, id) : body.kind === "order" ? findOrderById(database, id) : null;
  if (!doc) return Response.json({ error: "Documento não encontrado." }, { status: 404 });
  const token = createPhotoLink(database, body.kind!, id, session.user.name);
  // Endereço que a equipe está usando (o servidor escuta em 0.0.0.0; request.url não serve para o cliente).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const url = `${proto}://${host}/fotos/${token}`;
  const code = body.kind === "quote" ? quoteCode(id) : orderCode(id);
  const first = doc.customer.name === NO_CUSTOMER_NAME ? "" : doc.customer.name.trim().split(/\s+/)[0] ?? "";
  const message = [
    `Olá${first ? `, ${first}` : ""}! Aqui é da Fare Foto.`,
    `Para as fotos do ${body.kind === "quote" ? "orçamento" : "pedido"} ${code}, envie as imagens por este link: ${url}`,
    "Lá você recorta cada foto, escolhe o papel (brilho ou fosco) e pode mudar as quantidades — o valor atualiza na hora.",
  ].join("\n\n");
  const phone = doc.customer.phone?.replace(/\D/g, "") ?? "";
  return Response.json({ url, message, whatsappUrl: phone.length >= 10 ? buildWhatsAppUrl(phone.startsWith("55") ? phone : `55${phone}`, message) : null });
}
