import type { DatabaseSync } from "node:sqlite";
import type { Brain } from "@/lib/atendimento/simulatedBrain";
import { SIMULATED_AI_NAME } from "@/lib/atendimento/simulatedBrain";
import {
  AtendimentoError,
  addMessage,
  firstName,
  getConversation,
  listMessages,
  reopenConversation,
  sendToQueue,
  updateConversationProfile,
  type StaffActor,
} from "@/lib/atendimento/repository";
import type { Conversation, Message } from "@/lib/atendimento/types";

/**
 * Mensagem do cliente chegou (do simulador hoje; do WhatsApp na etapa seguinte).
 * A IA só responde se a conversa estiver na etapa "IA atendendo".
 */
export async function receiveCustomerMessage(
  db: DatabaseSync,
  conversationId: string,
  text: string,
  brain: Brain,
  aiName = SIMULATED_AI_NAME,
): Promise<{ conversation: Conversation; created: Message[] }> {
  const before = getConversation(db, conversationId);
  if (before.status === "finalizada") reopenConversation(db, conversationId);
  const customerMessage = addMessage(db, { conversationId, author: "cliente", authorName: before.contactName, body: text });
  const created: Message[] = [customerMessage];

  const conversation = getConversation(db, conversationId);
  if (conversation.status !== "ia") return { conversation, created };

  const result = await brain({ conversation, messages: listMessages(db, conversationId) });

  // Um vendedor pode ter assumido enquanto a IA pensava: aí a resposta da IA é descartada.
  const now = getConversation(db, conversationId);
  if (now.status !== "ia") return { conversation: now, created };

  if (result.contactName || result.summary !== undefined) {
    updateConversationProfile(db, conversationId, { contactName: result.contactName, summary: result.summary });
  }
  if (result.reply) created.push(addMessage(db, { conversationId, author: "ia", authorName: aiName, body: result.reply }));
  if (result.handoff) sendToQueue(db, conversationId, null, result.handoff.reason);
  return { conversation: getConversation(db, conversationId), created };
}

/** "*Ana:*\nTexto" — negrito do WhatsApp com o primeiro nome do vendedor. */
export function signedText(staffName: string, text: string) {
  return `*${firstName(staffName)}:*\n${text}`;
}

/** Vendedor responde. Só quem assumiu a conversa pode escrever (evita duas pessoas respondendo o mesmo cliente). */
export function sendStaffMessage(db: DatabaseSync, conversationId: string, staff: StaffActor, text: string, options: { sign: boolean }): Message {
  const conversation = getConversation(db, conversationId);
  if (conversation.status !== "em_atendimento" || conversation.assignedStaffId !== staff.id) {
    throw new AtendimentoError("NOT_ASSIGNED", "Assuma a conversa antes de responder.");
  }
  const body = text.trim();
  if (!body) throw new AtendimentoError("INVALID_REQUEST", "Mensagem vazia.");
  return addMessage(db, {
    conversationId,
    author: "vendedor",
    authorName: staff.name,
    body,
    deliveredText: options.sign ? signedText(staff.name, body) : body,
  });
}
