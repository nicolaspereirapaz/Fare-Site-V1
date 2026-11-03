import type { DatabaseSync } from "node:sqlite";
import type { Brain } from "@/lib/atendimento/simulatedBrain";
import { SIMULATED_AI_NAME } from "@/lib/atendimento/simulatedBrain";
import { copyMedia } from "@/lib/atendimento/media";
import {
  AtendimentoError,
  addMessage,
  firstName,
  getConversation,
  getQuickReply,
  listMessages,
  customerReplied,
  reopenConversation,
  sendToQueue,
  updateConversationProfile,
  type StaffActor,
} from "@/lib/atendimento/repository";
import { isInternal, isSellerStatus, type Conversation, type MediaKind, type Message } from "@/lib/atendimento/types";

/** Grava a mensagem do cliente (reabre finalizada; tira de "Aguardando cliente"). Não chama a IA. */
export function recordCustomerMessage(
  db: DatabaseSync,
  conversationId: string,
  text: string,
  media?: { file: string; kind: MediaKind; mime: string; name: string; size: number; hasThumb: boolean },
): Message {
  const before = getConversation(db, conversationId);
  if (before.status === "finalizada") reopenConversation(db, conversationId);
  if (before.status === "aguardando_cliente") customerReplied(db, conversationId);
  return addMessage(db, { conversationId, author: "cliente", authorName: before.contactName, body: text, media });
}

/** Conversas em que a IA está pensando agora (o painel mostra "digitando…"). */
const aiRuns = new Map<string, { again: boolean }>();
export const isAiThinking = (conversationId: string) => aiRuns.has(conversationId);

/**
 * A IA responde a conversa, se ela estiver em "IA atendendo".
 * Uma resposta por vez por conversa: se o cliente mandar outra mensagem enquanto a IA pensa,
 * a resposta velha é descartada e a IA responde de novo já vendo tudo (sem respostas duplicadas).
 */
export async function runAi(db: DatabaseSync, conversationId: string, brain: Brain, aiName = SIMULATED_AI_NAME): Promise<Message[]> {
  const current = aiRuns.get(conversationId);
  if (current) {
    current.again = true;
    return [];
  }
  const state = { again: false };
  aiRuns.set(conversationId, state);
  const created: Message[] = [];
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      state.again = false;
      const conversation = getConversation(db, conversationId);
      if (conversation.status !== "ia") return created;
      const messages = listMessages(db, conversationId);
      if (messages.filter((message) => !isInternal(message.author)).at(-1)?.author !== "cliente") return created;
      const lastSeq = messages.at(-1)?.seq ?? 0;

      const result = await brain({ conversation, messages });

      // Um vendedor assumiu enquanto a IA pensava: resposta descartada.
      if (getConversation(db, conversationId).status !== "ia") return created;
      // Chegou mensagem nova do cliente: responde de novo, vendo tudo.
      if (state.again || listMessages(db, conversationId, lastSeq).some((message) => message.author === "cliente")) continue;

      if (result.contactName || result.summary !== undefined) {
        updateConversationProfile(db, conversationId, { contactName: result.contactName, summary: result.summary });
      }
      if (result.reply) created.push(addMessage(db, { conversationId, author: "ia", authorName: aiName, body: result.reply }));
      if (result.handoff) sendToQueue(db, conversationId, null, result.handoff.reason);
      return created;
    }
    return created;
  } finally {
    aiRuns.delete(conversationId);
  }
}

/** Mensagem do cliente + resposta da IA, esperando terminar (testes e uso simples). */
export async function receiveCustomerMessage(
  db: DatabaseSync,
  conversationId: string,
  text: string,
  brain: Brain,
  aiName = SIMULATED_AI_NAME,
): Promise<{ conversation: Conversation; created: Message[] }> {
  const customerMessage = recordCustomerMessage(db, conversationId, text);
  const created = [customerMessage, ...(await runAi(db, conversationId, brain, aiName))];
  return { conversation: getConversation(db, conversationId), created };
}

/** "*Ana:*\nTexto" — negrito do WhatsApp com o primeiro nome do vendedor. */
export function signedText(staffName: string, text: string) {
  return `*${firstName(staffName)}:*\n${text}`;
}

/** Nota interna: qualquer pessoa da equipe escreve (não precisa assumir); o cliente e a IA nunca veem. */
export function addNote(db: DatabaseSync, conversationId: string, staff: StaffActor, text: string): Message {
  const body = text.trim();
  if (!body) throw new AtendimentoError("INVALID_REQUEST", "Nota vazia.");
  getConversation(db, conversationId);
  return addMessage(db, { conversationId, author: "nota", authorName: staff.name, body });
}

/** Vendedor envia foto/arquivo (legenda opcional, assinada como as mensagens). Mesma regra: só quem assumiu. */
export function sendStaffMedia(
  db: DatabaseSync,
  conversationId: string,
  staff: StaffActor,
  media: { file: string; kind: MediaKind; mime: string; name: string; size: number; hasThumb: boolean },
  caption: string,
  options: { sign: boolean; replyToId?: string | null },
): Message {
  const conversation = getConversation(db, conversationId);
  if (!isSellerStatus(conversation.status) || conversation.assignedStaffId !== staff.id) {
    throw new AtendimentoError("NOT_ASSIGNED", "Assuma a conversa antes de responder.");
  }
  const body = caption.trim();
  return addMessage(db, {
    conversationId,
    author: "vendedor",
    authorName: staff.name,
    body,
    deliveredText: body && options.sign ? signedText(staff.name, body) : body,
    media,
    replyToId: options.replyToId,
  });
}

/** Mensagem rápida com anexo: o anexo vai com o texto como legenda (copiado para a conversa). */
export async function sendQuickReplyMedia(
  db: DatabaseSync,
  conversationId: string,
  staff: StaffActor,
  quickReplyId: string,
  caption: string,
  options: { sign: boolean; replyToId?: string | null },
): Promise<Message> {
  const reply = getQuickReply(db, quickReplyId);
  if (!reply.mediaFile || !reply.media) throw new AtendimentoError("INVALID_REQUEST", "Esta mensagem rápida não tem anexo.");
  const conversation = getConversation(db, conversationId);
  if (!isSellerStatus(conversation.status) || conversation.assignedStaffId !== staff.id) {
    throw new AtendimentoError("NOT_ASSIGNED", "Assuma a conversa antes de responder.");
  }
  const file = await copyMedia(reply.mediaFile, conversationId);
  return sendStaffMedia(db, conversationId, staff, { ...reply.media, file }, caption, options);
}

/** Vendedor responde. Só quem assumiu a conversa pode escrever (evita duas pessoas respondendo o mesmo cliente). */
export function sendStaffMessage(
  db: DatabaseSync,
  conversationId: string,
  staff: StaffActor,
  text: string,
  options: { sign: boolean; replyToId?: string | null },
): Message {
  const conversation = getConversation(db, conversationId);
  if (!isSellerStatus(conversation.status) || conversation.assignedStaffId !== staff.id) {
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
    replyToId: options.replyToId,
  });
}
