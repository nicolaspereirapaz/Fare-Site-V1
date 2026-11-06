import type { DatabaseSync } from "node:sqlite";
import { ORDER_STAFF_LABELS } from "@/lib/backoffice/orderStatus";
import { confirmAutoCustomerName, createPanelCustomer, customerHistory, DuplicateCustomerError, findCustomerDuplicates, normalizePhone, resolveCustomer } from "@/lib/customers/repository";
import { formatPersonName } from "@/lib/text/names";
import { isBrazilianPhone } from "@/lib/account/documents";
import { getConversation, setConversationCustomer, updateConversationProfile } from "@/lib/atendimento/repository";
import type { Conversation } from "@/lib/atendimento/types";
import { orderCode } from "@/lib/orders/orderCode";
import { QUOTE_STATUS_LABELS, quoteCode } from "@/lib/quotes/quoteCode";

export type LinkedCustomer = {
  ref: string;
  name: string;
  company: string;
  email: string;
  kind: "conta" | "painel";
  history: Array<{ kind: "quote" | "order"; id: string; code: string; status: string; statusLabel: string; totalCents: number | null; createdAt: string; href: string }>;
};

const quoteLabels = QUOTE_STATUS_LABELS as Record<string, string>;
const orderLabels = ORDER_STAFF_LABELS as Record<string, string>;

const AUTO_ACTOR = { id: "atendimento-whatsapp", name: "Atendimento (WhatsApp)" };
/** Pré-cadastro com o nome que o cliente disse à IA (o vendedor completa o sobrenome depois). */
const AI_ACTOR = { id: "atendimento-ia", name: "Atendimento (IA)" };

/**
 * A IA soube o nome do cliente: vira o pré-cadastro.
 *   - conversa sem cadastro: cria um com esse nome e o telefone;
 *   - cadastro criado sozinho com o nome do WhatsApp: troca pelo nome dito;
 *   - conta do site ou cadastro feito/confirmado antes: não mexe.
 */
export function preRegisterFromAi(db: DatabaseSync, conversationId: string, name: string): Conversation {
  const conversation = getConversation(db, conversationId);
  const clean = formatPersonName(name.replace(/[~*_]/g, ""));
  if (conversation.channel !== "whatsapp" || clean.length < 2) return conversation;
  try {
    if (conversation.customerRef) {
      if (confirmAutoCustomerName(db, conversation.customerRef, clean, AUTO_ACTOR.name, AI_ACTOR)) {
        setConversationCustomer(db, conversationId, conversation.customerRef, clean);
      }
      return getConversation(db, conversationId);
    }
    const phone = normalizePhone(conversation.phone);
    if (!isBrazilianPhone(phone)) return conversation;
    try {
      const created = createPanelCustomer(db, { name: clean, phone }, AI_ACTOR);
      setConversationCustomer(db, conversationId, created.ref, created.name);
    } catch (error) {
      if (!(error instanceof DuplicateCustomerError) || !error.matches[0]) return conversation;
      setConversationCustomer(db, conversationId, error.matches[0].ref, error.matches[0].name);
    }
    return getConversation(db, conversationId);
  } catch (error) {
    console.error("[atendimento] pré-cadastro pela IA:", error instanceof Error ? error.message : error);
    return getConversation(db, conversationId);
  }
}

/**
 * Liga a conversa do WhatsApp a um cadastro do site:
 *   - já existe cadastro com esse WhatsApp: usa ele (conta do site primeiro) e passa a mostrar o nome do cadastro;
 *   - não existe e `create`: cria um cadastro do painel com o nome informado e o telefone.
 *     Só quando a equipe abre a conversa pelo número; mensagem recebida não cria (pré-cadastro pelo bot desligado a pedido em 04/11/2026).
 * Nunca impede a mensagem de chegar: qualquer falha só deixa a conversa sem cadastro.
 */
export function linkConversationCustomer(db: DatabaseSync, conversationId: string, nameHint = "", create = false): Conversation {
  const conversation = getConversation(db, conversationId);
  if (conversation.channel !== "whatsapp" || conversation.customerRef) return conversation;
  try {
    const matches = findCustomerDuplicates(db, { phone: conversation.phone }).filter((match) => match.by.includes("WhatsApp"));
    const existing = matches.find((match) => match.kind === "conta") ?? matches[0];
    if (existing) {
      setConversationCustomer(db, conversationId, existing.ref, existing.name);
      updateConversationProfile(db, conversationId, { contactName: existing.name });
      return getConversation(db, conversationId);
    }
    if (!create) return conversation;
    const name = (nameHint || conversation.contactName).replace(/[~*_]/g, "").trim();
    const phone = normalizePhone(conversation.phone);
    if (name.length < 2 || !isBrazilianPhone(phone)) return conversation;
    try {
      const created = createPanelCustomer(db, { name, phone }, AUTO_ACTOR);
      setConversationCustomer(db, conversationId, created.ref, created.name);
    } catch (error) {
      if (!(error instanceof DuplicateCustomerError) || !error.matches[0]) return conversation;
      setConversationCustomer(db, conversationId, error.matches[0].ref, error.matches[0].name);
    }
    return getConversation(db, conversationId);
  } catch (error) {
    console.error("[atendimento] cadastro automático:", error instanceof Error ? error.message : error);
    return getConversation(db, conversationId);
  }
}

/**
 * Nome do cadastro que a IA pode usar sem perguntar: conta do site ou cadastro feito pela equipe.
 * Cadastro criado sozinho a partir do nome de exibição do WhatsApp NÃO conta (nome não confirmado).
 */
export function registeredNameFor(db: DatabaseSync, conversation: Conversation): string | null {
  if (!conversation.customerRef) return null;
  try {
    const customer = resolveCustomer(db, conversation.customerRef);
    if (!customer || (customer.kind === "painel" && customer.createdBy === AUTO_ACTOR.name)) return null;
    return customer.name.replace(/[~*_]/g, "").trim() || null;
  } catch {
    return null;
  }
}

/** Cadastros do site com o mesmo WhatsApp da conversa, com orçamentos e pedidos (mais novos primeiro). */
export function customersForPhone(db: DatabaseSync, phone: string): LinkedCustomer[] {
  return findCustomerDuplicates(db, { phone })
    .filter((match) => match.by.includes("WhatsApp"))
    .map((match) => ({
      ref: match.ref,
      name: match.name,
      company: match.company,
      email: match.email,
      kind: match.kind,
      history: customerHistory(db, match.ref)
        .slice(0, 8)
        .map((entry) => ({
          ...entry,
          code: entry.kind === "quote" ? quoteCode(entry.id) : orderCode(entry.id),
          statusLabel: (entry.kind === "quote" ? quoteLabels : orderLabels)[entry.status] ?? entry.status,
          href: entry.kind === "quote" ? `/equipe/orcamentos/${entry.id}/consulta` : `/equipe/pedidos/${entry.id}`,
        })),
    }));
}

const CLOSED_QUOTE = new Set(["virou_pedido", "encerrado"]);
const CLOSED_ORDER = new Set(["concluido", "cancelado"]);
// Orçamento esquecido em aberto não prende o cliente para sempre: só conta o dos últimos 30 dias.
const OPEN_QUOTE_DAYS = 30;

/** Orçamento ou pedido em andamento de algum cadastro com esse WhatsApp (código, ex. "PED-0123"), ou null. */
export function openDocumentForPhone(db: DatabaseSync, phone: string, now = Date.now()): string | null {
  for (const customer of customersForPhone(db, phone)) {
    const open = customer.history.find((entry) => entry.kind === "order"
      ? !CLOSED_ORDER.has(entry.status)
      : !CLOSED_QUOTE.has(entry.status) && now - Date.parse(entry.createdAt) < OPEN_QUOTE_DAYS * 86_400_000);
    if (open) return open.code;
  }
  return null;
}
