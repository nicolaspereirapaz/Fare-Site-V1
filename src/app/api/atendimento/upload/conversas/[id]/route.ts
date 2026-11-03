import { AtendimentoError, getConversation } from "@/lib/atendimento/repository";
import { atendimentoDb, deliverInBackground, json, withStaff } from "@/lib/atendimento/server";
import { sendStaffMedia } from "@/lib/atendimento/service";
import { readBrowserUpload } from "@/lib/atendimento/upload";
import { isSellerStatus } from "@/lib/atendimento/types";

export const dynamic = "force-dynamic";

/**
 * Vendedor envia foto/arquivo. x-original: 1 = foto como documento (qualidade original, sem compressão do WhatsApp).
 * Fora do proxy do site (arquivos grandes).
 */
export const POST = withStaff(async (staff, request, context: RouteContext<"/api/atendimento/upload/conversas/[id]">) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const conversation = getConversation(db, id);
  // Confere antes de gravar o arquivo (sem sobrar arquivo de quem não podia enviar).
  if (!isSellerStatus(conversation.status) || conversation.assignedStaffId !== staff.id) {
    throw new AtendimentoError("NOT_ASSIGNED", "Assuma a conversa antes de responder.");
  }
  const { media, caption } = await readBrowserUpload(request, id, { asDocument: request.headers.get("x-original") === "1" });
  const message = sendStaffMedia(db, id, staff, media, caption, { sign: request.headers.get("x-sign") !== "0" });
  deliverInBackground(db, [message]);
  return json({ message, conversation: getConversation(db, id) }, 201);
});
