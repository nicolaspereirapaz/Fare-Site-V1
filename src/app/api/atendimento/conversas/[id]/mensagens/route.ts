import { atendimentoDb, deliverInBackground, json, readJson, text, withStaff } from "@/lib/atendimento/server";
import { addNote, sendQuickReplyMedia, sendStaffMessage } from "@/lib/atendimento/service";
import { getConversation } from "@/lib/atendimento/repository";

export const dynamic = "force-dynamic";

/** Vendedor envia mensagem (sign: assina com o primeiro nome). Simulador: só grava. WhatsApp: sai pela ponte em seguida. */
export const POST = withStaff(async (staff, request, context: RouteContext<"/api/atendimento/conversas/[id]/mensagens">) => {
  const { id } = await context.params;
  const body = await readJson(request);
  const db = atendimentoDb();
  if (body.note === true) {
    // Nota interna: fica só no painel.
    return json({ message: addNote(db, id, staff, text(body.text, 2000)), conversation: getConversation(db, id) }, 201);
  }
  const options = { sign: body.sign !== false, replyToId: text(body.replyTo, 80) || null };
  // Mensagem rápida com anexo: o anexo vai com o texto como legenda.
  const quickReplyId = text(body.quickReplyId, 80);
  const message = quickReplyId
    ? await sendQuickReplyMedia(db, id, staff, quickReplyId, text(body.text), options)
    : sendStaffMessage(db, id, staff, text(body.text), options);
  deliverInBackground(db, [message]);
  return json({ message, conversation: getConversation(db, id) }, 201);
});
