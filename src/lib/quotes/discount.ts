/**
 * Desconto no total do orçamento (dado pela equipe no painel).
 * Sem dependências de servidor: usado também na tela do editor.
 */

/**
 * freight: frete cobrado do cliente (R$), somado ao total. Gravado junto com o desconto para seguir o mesmo caminho.
 * credit: crédito do cliente usado (R$), abatido do total em linha própria (saldo em customers/credit.ts).
 */
export type QuoteDiscount = { type: "percent" | "value"; value: number; freight?: number; credit?: number };

/** Frete gravado no documento, em reais (0 = a combinar). */
export const freightOf = (discount: QuoteDiscount | null | undefined) => discount?.freight ?? 0;

/** Crédito do cliente usado no documento, em reais (0 = nenhum). */
export const creditOf = (discount: QuoteDiscount | null | undefined) => discount?.credit ?? 0;

/** "1.250,50", "7,5", 150 → número; NaN se não der para ler. */
function toNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const text = String(raw ?? "").trim();
  if (!text) return NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return Number(normalized);
}

/** Valida desconto, frete e crédito vindos do navegador. Vazio ou zero em todos = null. */
export function parseDiscount(raw: unknown): QuoteDiscount | null {
  if (raw === null || raw === undefined) return null;
  const body = raw as Record<string, unknown>;
  if (body.type !== "percent" && body.type !== "value") throw new Error("Desconto inválido.");
  const freight = parseMoney(body.freight, "Frete inválido.");
  const credit = parseMoney(body.credit, "Crédito inválido.");
  const discount = parseDiscountValue(body.type, body.value);
  if (!freight && !credit) return discount;
  return { ...(discount ?? { type: body.type, value: 0 }), ...(freight ? { freight } : {}), ...(credit ? { credit } : {}) };
}

function parseMoney(raw: unknown, error: string): number {
  if (raw === "" || raw === null || raw === undefined) return 0;
  const value = toNumber(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(error);
  return Math.round(value * 100) / 100;
}

function parseDiscountValue(type: "percent" | "value", raw: unknown): QuoteDiscount | null {
  const body = { type, value: raw };
  if (body.value === "" || body.value === null || body.value === undefined) return null;
  const value = toNumber(body.value);
  if (!Number.isFinite(value)) throw new Error("Desconto inválido.");
  if (body.type === "percent") {
    if (value < 0 || value > 100) throw new Error("Desconto em porcentagem vai de 0 a 100%.");
    const percent = Math.round(value * 100) / 100;
    return percent > 0 ? { type: "percent", value: percent } : null;
  }
  if (value < 0) throw new Error("Desconto inválido.");
  const money = Math.floor(Math.round(value * 1e6) / 1e4) / 100;
  return money > 0 ? { type: "value", value: money } : null;
}

/** Aplica desconto, frete e crédito ao subtotal (em centavos). Porcentagem arredonda o desconto para baixo. */
export function applyDiscount(subtotalCents: number, discount: QuoteDiscount | null) {
  if (!discount) return { subtotalCents, discountCents: 0, freightCents: 0, creditCents: 0, totalCents: subtotalCents };
  const freightCents = Math.round(freightOf(discount) * 100);
  const creditCents = Math.round(creditOf(discount) * 100);
  const discountCents = discount.type === "percent"
    ? Math.floor(Math.round(subtotalCents * discount.value * 1e4) / 1e6)
    : Math.round(discount.value * 100);
  if (discountCents > subtotalCents) throw new Error("O desconto não pode ser maior que o subtotal.");
  const beforeCredit = subtotalCents - discountCents + freightCents;
  if (creditCents > beforeCredit) throw new Error("O crédito não pode ser maior que o total.");
  return { subtotalCents, discountCents, freightCents, creditCents, totalCents: beforeCredit - creditCents };
}

/**
 * Linha do desconto para telas: rótulo e valor em reais (null = sem desconto).
 * Calculada pelo SUBTOTAL dos itens, igual ao que foi gravado (reconstruir pelo total perde centavos e some com 100%).
 */
export function discountLine(
  discount: QuoteDiscount | null | undefined,
  items: Array<{ unitPrice: number | null; quantity: number }>,
): { label: string; amount: number } | null {
  if (!discount || items.some((item) => item.unitPrice === null)) return null;
  const subtotalCents = Math.round(items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
  try {
    const { discountCents } = applyDiscount(subtotalCents, discount);
    return discountCents > 0 ? { label: discountLabel(discount), amount: discountCents / 100 } : null;
  } catch {
    return null;
  }
}

/** "Desconto (7,5%)" ou "Desconto". */
export function discountLabel(discount: QuoteDiscount): string {
  return discount.type === "percent" ? `Desconto (${discount.value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%)` : "Desconto";
}
