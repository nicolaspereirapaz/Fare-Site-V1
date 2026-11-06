import type { DatabaseSync } from "node:sqlite";
import type { Brain } from "@/lib/atendimento/simulatedBrain";
import { SIMULATED_AI_NAME } from "@/lib/atendimento/simulatedBrain";
import { copyMedia } from "@/lib/atendimento/media";
import { preRegisterFromAi, registeredNameFor } from "@/lib/atendimento/customer";

import {
  AtendimentoError,
  addMessage,
  firstName,
  getConversation,
  getQuickReply,
  aiEnabled,
  holdForSeller,
  listMessages,
  customerReplied,
  reopenConversation,
  handOffToStaff,
  openForStaff,
  updateConversationProfile,
  type StaffActor,
} from "@/lib/atendimento/repository";
import { isInternal, type Conversation, type MediaKind, type Message } from "@/lib/atendimento/types";
import { openDocumentForPhone } from "@/lib/atendimento/customer";
import { foldText } from "@/lib/atendimento/search";

// Voltou a escrever até 3 dias depois da última mensagem: continuação do mesmo assunto, fica com o vendedor.
const RECENT_MS = 3 * 86_400_000;
/** Mensagem pronta do QR Code da loja: cliente está no balcão, a equipe atende ali. */
export const isStoreQrMessage = (text: string) => /^\W*ola\W+estou na loja\b/.test(foldText(text));

/**
 * Por que a IA NÃO deve responder esta mensagem (vai para o vendedor), ou null.
 * A IA responde todos os números, menos: cliente na loja (QR Code) e, ao começar ou reabrir a conversa,
 * quem tem orçamento/pedido em aberto ou voltou logo depois da última conversa.
 */
function sellerReason(db: DatabaseSync, before: Conversation, text: string, now = Date.now()): string | null {
  if (before.status !== "ia" && before.status !== "finalizada") return null;
  if (isStoreQrMessage(text)) return "Cliente na loja (QR Code)";
  const starting = before.status === "finalizada" || !listMessages(db, before.id).some((message) => !isInternal(message.author));
  if (!starting) return null;
  const open = before.channel === "whatsapp" ? openDocumentForPhone(db, before.phone, now) : null;
  if (open) return `Cliente com ${open} em aberto`;
  if (before.status === "finalizada" && now - Date.parse(before.lastMessageAt) < RECENT_MS) return "Cliente voltou a escrever logo depois da última conversa";
  return null;
}

/** Grava a mensagem do cliente (reabre finalizada; tira de "Aguardando cliente"; aplica as regras de quem responde). Não chama a IA. */
export function recordCustomerMessage(
  db: DatabaseSync,
  conversationId: string,
  text: string,
  media?: { file: string; kind: MediaKind; mime: string; name: string; size: number; hasThumb: boolean },
): Message {
  const before = getConversation(db, conversationId);
  const reason = sellerReason(db, before, text);
  if (before.status === "finalizada" && !reason) reopenConversation(db, conversationId);
  if (before.status === "aguardando_cliente") customerReplied(db, conversationId);
  const message = addMessage(db, { conversationId, author: "cliente", authorName: before.contactName, body: text, media });
  if (reason) holdForSeller(db, conversationId, reason);
  return message;
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

      const result = await brain({ conversation, messages, registeredName: registeredNameFor(db, conversation) });

      // A equipe entrou na conversa enquanto a IA pensava: resposta descartada.
      if (getConversation(db, conversationId).status !== "ia") return created;
      // Chegou mensagem nova do cliente: responde de novo, vendo tudo.
      if (state.again || listMessages(db, conversationId, lastSeq).some((message) => message.author === "cliente")) continue;

      if (result.contactName || result.summary !== undefined) {
        updateConversationProfile(db, conversationId, { contactName: result.contactName, summary: result.summary });
      }
      // Só vira cadastro o nome que o cliente escreveu (nunca o nome de exibição do WhatsApp).
      if (result.contactName && nameTypedByCustomer(result.contactName, messages)) preRegisterFromAi(db, conversationId, result.contactName);
      if (result.reply) created.push(addMessage(db, { conversationId, author: "ia", authorName: aiName, body: result.reply }));
      if (result.handoff) handOffToStaff(db, conversationId, result.handoff.reason);
      return created;
    }
    return created;
  } finally {
    aiRuns.delete(conversationId);
  }
}

/**
 * IA desligada: a conversa com mensagem nova do cliente vai para "Em atendimento" (ninguém responde sozinho).
 * Devolve true se a IA está desligada (quem chamou não deve rodar a IA).
 */
export function queueIfAiOff(db: DatabaseSync, conversationId: string): boolean {
  if (aiEnabled(db)) return false;
  const last = listMessages(db, conversationId).filter((message) => !isInternal(message.author)).at(-1);
  if (last?.author === "cliente") holdForSeller(db, conversationId);
  return true;
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

/** Nota interna: qualquer pessoa da equipe escreve; o cliente e a IA nunca veem. */
export function addNote(db: DatabaseSync, conversationId: string, staff: StaffActor, text: string): Message {
  const body = text.trim();
  if (!body) throw new AtendimentoError("INVALID_REQUEST", "Nota vazia.");
  getConversation(db, conversationId);
  return addMessage(db, { conversationId, author: "nota", authorName: staff.name, body });
}

/** Vendedor envia foto/arquivo (legenda opcional, assinada como as mensagens). */
export function sendStaffMedia(
  db: DatabaseSync,
  conversationId: string,
  staff: StaffActor,
  media: { file: string; kind: MediaKind; mime: string; name: string; size: number; hasThumb: boolean },
  caption: string,
  options: { sign: boolean; replyToId?: string | null },
): Message {
  openForStaff(db, conversationId, staff);
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
  openForStaff(db, conversationId, staff);
  const file = await copyMedia(reply.mediaFile, conversationId);
  return sendStaffMedia(db, conversationId, staff, { ...reply.media, file }, caption, options);
}

/** Vendedor responde. Qualquer pessoa da equipe escreve; conversa com a IA ou finalizada vai para "Em atendimento". */
export function sendStaffMessage(
  db: DatabaseSync,
  conversationId: string,
  staff: StaffActor,
  text: string,
  options: { sign: boolean; replyToId?: string | null },
): Message {
  openForStaff(db, conversationId, staff);
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

/** O primeiro nome aparece, como palavra, em alguma mensagem escrita (ou transcrita) pelo cliente. */
export function nameTypedByCustomer(name: string, messages: Message[]) {
  const first = foldText(name.trim().split(/\s+/)[0] ?? "");
  if (first.length < 2) return false;
  const word = new RegExp(`(^|[^\\p{L}])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u");
  return messages.some((message) => message.author === "cliente" && word.test(foldText(`${message.body} ${message.transcript ?? ""}`)));
}
