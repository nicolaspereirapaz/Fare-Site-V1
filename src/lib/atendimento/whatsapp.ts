import type { DatabaseSync } from "node:sqlite";
import {
  AtendimentoError,
  createConversation,
  findWhatsAppConversation,
  getConversation,
  getMessage,
  messageByExternalId,
  phoneDigits,
  setDelivery,
  updateConversationProfile,
} from "@/lib/atendimento/repository";
import { recordCustomerMessage } from "@/lib/atendimento/service";
import type { Message } from "@/lib/atendimento/types";

/**
 * Ligação com o WhatsApp pela ponte Baileys (modo painel).
 *   Entrada: a ponte manda cada mensagem do cliente para POST /api/atendimento/whatsapp/entrada.
 *   Saída:   o site manda respostas da IA e dos vendedores para POST {ponte}/fare/painel/enviar.
 * As duas pontas usam o mesmo token (FARE_PONTE_TOKEN). Sem FARE_PONTE_URL, nada é enviado.
 */
export type BridgeConfig = { url: string; token: string };

export function bridgeConfig(env: Record<string, string | undefined> = process.env): BridgeConfig | null {
  const url = env.FARE_PONTE_URL?.trim().replace(/\/$/, "");
  const token = env.FARE_PONTE_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** Comparação em tempo constante do token recebido. */
export function tokenMatches(received: string | null, expected: string | undefined) {
  if (!received || !expected || received.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) diff |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  return diff === 0;
}

export type InboundWhatsApp = {
  /** Id da mensagem no WhatsApp: a mesma mensagem nunca entra duas vezes. */
  externalId: string;
  /** Destino na ponte (…@s.whatsapp.net ou …@lid). */
  chatId: string;
  /** Telefone com DDI, só dígitos. */
  phone: string;
  /** Nome do perfil do WhatsApp (pushName), quando houver. */
  pushName?: string;
  text: string;
};

export function parseInbound(body: Record<string, unknown>): InboundWhatsApp {
  const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const inbound = {
    externalId: str(body.externalId, 200),
    chatId: str(body.chatId, 120),
    phone: phoneDigits(str(body.phone, 30)),
    pushName: str(body.pushName, 80),
    text: str(body.text, 4000),
  };
  if (!inbound.externalId || !/@(s\.whatsapp\.net|lid)$/.test(inbound.chatId) || !/^\d{10,15}$/.test(inbound.phone) || !inbound.text) {
    throw new AtendimentoError("INVALID_REQUEST", "Mensagem do WhatsApp inválida.");
  }
  return inbound;
}

/** Grava a mensagem do cliente vinda do WhatsApp. Repetida (mesmo id)? Ignora. */
export function receiveWhatsAppMessage(db: DatabaseSync, inbound: InboundWhatsApp): { conversationId: string; duplicate: boolean } {
  const existing = messageByExternalId(db, inbound.externalId);
  if (existing) return { conversationId: existing.conversationId, duplicate: true };
  let conversation = findWhatsAppConversation(db, inbound.chatId, inbound.phone);
  if (!conversation) conversation = createConversation(db, { channel: "whatsapp", phone: inbound.phone, waChatId: inbound.chatId });
  // Nome do perfil do WhatsApp só como sugestão inicial; a IA confirma perguntando "Qual o seu nome?".
  if (!conversation.contactName && inbound.pushName) updateConversationProfile(db, conversation.id, { contactName: inbound.pushName });
  const message = recordCustomerMessage(db, conversation.id, inbound.text);
  db.prepare("UPDATE atd_messages SET external_id = ? WHERE id = ?").run(inbound.externalId, message.id);
  return { conversationId: conversation.id, duplicate: false };
}

/**
 * Manda ao cliente as mensagens da IA/vendedor de uma conversa do WhatsApp.
 * Marca cada uma como enviada ou falhou (o painel mostra e deixa reenviar).
 */
export async function deliverToWhatsApp(db: DatabaseSync, messages: Message[], config = bridgeConfig(), fetcher: typeof fetch = fetch) {
  for (const message of messages) {
    if (message.author !== "ia" && message.author !== "vendedor") continue;
    const conversation = getConversation(db, message.conversationId);
    if (conversation.channel !== "whatsapp") continue;
    const current = getMessage(db, message.id);
    if (!current || current.delivery === "enviada") continue;
    if (!config) {
      setDelivery(db, message.id, "falhou", { error: "Ponte do WhatsApp não configurada." });
      continue;
    }
    if (!conversation.waChatId) {
      setDelivery(db, message.id, "falhou", { error: "Conversa sem destino no WhatsApp." });
      continue;
    }
    setDelivery(db, message.id, "pendente");
    try {
      const response = await fetcher(`${config.url}/fare/painel/enviar`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-fare-token": config.token },
        body: JSON.stringify({ chatId: conversation.waChatId, text: current.deliveredText, ref: message.id }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await response.json().catch(() => ({}))) as { messageId?: string; error?: string };
      if (!response.ok) throw new Error(data.error || `Ponte respondeu ${response.status}`);
      setDelivery(db, message.id, "enviada", { externalId: data.messageId ?? null });
    } catch (error) {
      setDelivery(db, message.id, "falhou", { error: error instanceof Error ? error.message : "Falha no envio." });
    }
  }
}
