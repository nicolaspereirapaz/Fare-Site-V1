import { customersForPhone, linkConversationCustomer } from "@/lib/atendimento/customer";
import {
  AtendimentoError,
  aiEnabled,
  assumeConversation,
  finishConversation,
  getConversation,
  getMessage,
  listMessages,
  recentDeliveries,
  recentTranscripts,
  setConversationTags,
  markConversationRead,
  markConversationUnread,
  moveConversation,
  returnToAi,
} from "@/lib/atendimento/repository";
import { activeBrain, atendimentoDb, deliverInBackground, json, readJson, respondInBackground, text, withStaff } from "@/lib/atendimento/server";
import { isAiThinking } from "@/lib/atendimento/service";
import { isConversationStatus } from "@/lib/atendimento/types";

export const dynamic = "force-dynamic";

type Context = RouteContext<"/api/atendimento/conversas/[id]">;

/** Conversa aberta: mensagens (só as novas, com ?depois=SEQ) e cadastros do site com o mesmo WhatsApp. */
export const GET = withStaff(async (_staff, request, context: Context) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const withCustomers = new URL(request.url).searchParams.get("clientes") !== "0";
  // Ao abrir, liga ao cadastro que já existe com esse WhatsApp (não cria).
  const conversation = withCustomers ? linkConversationCustomer(db, id) : getConversation(db, id);
  const after = Number(new URL(request.url).searchParams.get("depois") ?? 0) || 0;
  return json({
    conversation,
    messages: listMessages(db, id, after),
    customers: withCustomers ? customersForPhone(db, conversation.phone) : undefined,
    aiThinking: isAiThinking(id),
    aiMode: activeBrain().mode,
    // Status de envio ao WhatsApp das últimas mensagens (muda depois que a mensagem já apareceu).
    deliveries: conversation.channel === "whatsapp" ? recentDeliveries(db, id) : [],
    transcripts: recentTranscripts(db, id),
  });
});

/** Ações: assumir (Em atendimento), devolver (para a IA), finalizar, mover (arrastar no quadro), lida e nao_lida. */
export const PATCH = withStaff(async (staff, request, context: Context) => {
  const { id } = await context.params;
  const db = atendimentoDb();
  const body = await readJson(request);
  // Voltou para a IA com mensagem do cliente sem resposta: a IA responde em seguida.
  if (body.action === "devolver" || (body.action === "mover" && body.status === "ia")) {
    if (!aiEnabled(db)) throw new AtendimentoError("INVALID_REQUEST", "A IA está desligada. Ligue a IA no topo do Atendimento para devolver conversas para ela.");
    respondInBackground(db, id);
  }
  switch (body.action) {
    case "etiquetas":
      return json({ conversation: setConversationTags(db, id, body.tags) });
    case "reenviar": {
      // Mensagem que falhou no WhatsApp: tenta de novo.
      const message = getMessage(db, text(body.messageId, 80));
      if (!message || message.conversationId !== id || message.delivery !== "falhou") throw new AtendimentoError("INVALID_REQUEST", "Nada para reenviar.");
      deliverInBackground(db, [message]);
      return json({ conversation: getConversation(db, id) });
    }
    case "assumir":
      return json({ conversation: assumeConversation(db, id, staff) });
    case "devolver":
      return json({ conversation: returnToAi(db, id, staff, text(body.note, 400)) });
    case "finalizar":
      return json({ conversation: finishConversation(db, id, staff) });
    case "mover":
      if (!isConversationStatus(body.status)) throw new AtendimentoError("INVALID_REQUEST", "Etapa inválida.");
      return json({ conversation: moveConversation(db, id, body.status, staff) });
    case "lida":
      markConversationRead(db, id);
      return json({ conversation: getConversation(db, id) });
    case "nao_lida":
      markConversationUnread(db, id);
      return json({ conversation: getConversation(db, id) });
    default:
      throw new AtendimentoError("INVALID_REQUEST", "Ação desconhecida.");
  }
});
