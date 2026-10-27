/**
 * Desconto no total do orçamento (dado pela equipe no painel).
 * Sem dependências de servidor: usado também na tela do editor.
 */

/** freight: frete cobrado do cliente (R$), somado ao total. Gravado junto com o desconto para seguir o mesmo caminho. */
export type QuoteDiscount = { type: "percent" | "value"; value: number; freight?: number };

/** Frete gravado no documento, em reais (0 = a combinar). */
export const freightOf = (discount: QuoteDiscount | null | undefined) => discount?.freight ?? 0;

/** "1.250,50", "7,5", 150 → número; NaN se não der para ler. */
function toNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  const text = String(raw ?? "").trim();
  if (!text) return NaN;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return Number(normalized);
}

/** Valida desconto e frete vindos do navegador. Vazio ou zero nos dois = null. */
export function parseDiscount(raw: unknown): QuoteDiscount | null {
  if (raw === null || raw === undefined) return null;
  const body = raw as Record<string, unknown>;
  if (body.type !== "percent" && body.type !== "value") throw new Error("Desconto inválido.");
  const freight = parseFreight(body.freight);
  const discount = parseDiscountValue(body.type, body.value);
  if (!freight) return discount;
  return { ...(discount ?? { type: body.type, value: 0 }), freight };
}

function parseFreight(raw: unknown): number {
  if (raw === "" || raw === null || raw === undefined) return 0;
  const value = toNumber(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error("Frete inválido.");
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

/** Aplica o desconto ao subtotal (em centavos). Porcentagem arredonda o desconto para baixo. */
export function applyDiscount(subtotalCents: number, discount: QuoteDiscount | null) {
  if (!discount) return { subtotalCents, discountCents: 0, freightCents: 0, totalCents: subtotalCents };
  const freightCents = Math.round(freightOf(discount) * 100);
  const discountCents = discount.type === "percent"
    ? Math.floor(Math.round(subtotalCents * discount.value * 1e4) / 1e6)
    : Math.round(discount.value * 100);
  if (discountCents > subtotalCents) throw new Error("O desconto não pode ser maior que o subtotal.");
  return { subtotalCents, discountCents, freightCents, totalCents: subtotalCents - discountCents + freightCents };
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
