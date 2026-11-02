import type { DatabaseSync } from "node:sqlite";
import { ORDER_STAFF_LABELS } from "@/lib/backoffice/orderStatus";
import { customerHistory, findCustomerDuplicates } from "@/lib/customers/repository";
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
