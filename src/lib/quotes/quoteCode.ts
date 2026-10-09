/** Situações do orçamento (sem dependências de servidor: usado também nas telas). */
export const QUOTE_STATUSES = ["aguardando_resposta", "respondido", "virou_pedido", "encerrado"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Número curto do orçamento para o cliente citar (ex.: #ORC-3F7A2C). */
export function quoteCode(id: string): string {
  return `ORC-${id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
}
