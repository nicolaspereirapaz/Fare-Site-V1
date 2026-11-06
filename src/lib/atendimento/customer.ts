import type { DatabaseSync } from "node:sqlite";
import { ORDER_STAFF_LABELS } from "@/lib/backoffice/orderStatus";
import { createPanelCustomer, customerHistory, DuplicateCustomerError, findCustomerDuplicates, normalizePhone, resolveCustomer } from "@/lib/customers/repository";
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

/**
 * Liga a conversa do WhatsApp a um cadastro do site:
 *   - já existe cadastro com esse WhatsApp: usa ele (conta do site primeiro) e passa a mostrar o nome do cadastro;
 *   - não existe: cria um cadastro do painel com o nome do WhatsApp (ou o informado) e o telefone.
 * Nunca impede a mensagem de chegar: qualquer falha só deixa a conversa sem cadastro.
 */
export function linkConversationCustomer(db: DatabaseSync, conversationId: string, nameHint = ""): Conversation {
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
