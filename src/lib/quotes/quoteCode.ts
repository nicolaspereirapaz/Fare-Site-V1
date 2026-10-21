import { documentNumberOf, formatDocumentNumber } from "@/lib/documentNumber";
/** Situações do orçamento (sem dependências de servidor: usado também nas telas). */
export const QUOTE_STATUSES = [
  "aguardando_orcamento",
  "em_negociacao",
  "aguardando_pagamento",
  "virou_pedido",
  "encerrado",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Colunas da aba Orçamentos do painel ("virou pedido" e "encerrado" saem do quadro). */
export const QUOTE_BOARD_COLUMNS = ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"] as const satisfies readonly QuoteStatus[];

/** Situações antigas → novas (para orçamentos gravados antes de 2026-10-09). */
export const LEGACY_QUOTE_STATUSES: Record<string, QuoteStatus> = {
  aguardando_resposta: "aguardando_orcamento",
  respondido: "em_negociacao",
};

/** Dono dos orçamentos criados no painel sem cliente (não aparece na "Minha conta" de ninguém). */
export const NO_CUSTOMER_OWNER = "sem-cliente";
export const NO_CUSTOMER_NAME = "Cliente a definir";

/** Número do orçamento para o cliente citar (ex.: #ORC-0001; orçamentos antigos: #ORC-3F7A2C). */
export function quoteCode(id: string): string {
  const n = documentNumberOf(id);
  return n === null ? `ORC-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}` : `ORC-${formatDocumentNumber(n)}`;
}

/**
 * Fluxo: aguardando orçamento → em negociação → aguardando pagamento → vira pedido (Criando arte).
 * Pode ser encerrado (desistiu) antes de virar pedido; do pagamento dá para voltar à negociação.
 */
const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  aguardando_orcamento: ["em_negociacao", "encerrado"],
  em_negociacao: ["aguardando_pagamento", "aguardando_orcamento", "encerrado"],
  aguardando_pagamento: ["virou_pedido", "em_negociacao", "encerrado"],
  virou_pedido: [],
  encerrado: [],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from].includes(to);
}

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return typeof value === "string" && (QUOTE_STATUSES as readonly string[]).includes(value);
}

export class InvalidQuoteTransitionError extends Error {
  constructor(from: QuoteStatus, to: QuoteStatus) {
    super(`Mudança de situação do orçamento inválida: "${from}" -> "${to}".`);
    this.name = "InvalidQuoteTransitionError";
  }
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  aguardando_orcamento: "Aguardando orçamento",
  em_negociacao: "Em negociação",
  aguardando_pagamento: "Aguardando pagamento",
  virou_pedido: "Virou pedido",
  encerrado: "Encerrado",
};

/** Texto dos botões do painel (o que a equipe está fazendo ao clicar). */
export function quoteActionLabel(from: QuoteStatus, to: QuoteStatus): string {
  if (to === "virou_pedido") return "Pagamento recebido";
  if (to === "encerrado") return "Encerrar (cliente desistiu)";
  if (from === "aguardando_pagamento" && to === "em_negociacao") return "Voltar para negociação";
  return QUOTE_STATUS_LABELS[to];
}
