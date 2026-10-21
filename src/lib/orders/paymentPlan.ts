import type { OrderFinance } from "@/lib/orders/payments";
import type { PaymentMethod } from "@/lib/orders/repository";

const LABELS: Record<PaymentMethod, string> = {
  pix: "Pix", dinheiro: "Dinheiro", cartao_debito: "Débito", cartao_credito: "Crédito", boleto: "Boleto", faturamento_empresa: "Faturamento",
};
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");
const day = (iso: string) => { const [, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}`; };

/**
 * Pagamento em partes, como aparece no pedido, no documento e na comanda:
 * cada recebimento ("21/10 · Pix · R$ 50,00") e o que falta e quando ("R$ 50,00 · na retirada").
 */
export function paymentPlan(finance: Pick<OrderFinance, "payments" | "balanceCents" | "dueDate" | "deliveryMode" | "installments">) {
  const receipts = finance.payments.map((p) => ({ label: `${day(p.paidAt)} · ${LABELS[p.paymentMethod]}`, amount: brl(p.amountCents) }));
  const when = finance.dueDate ? `vence ${day(finance.dueDate)}` : finance.deliveryMode === "entrega" ? "na entrega" : "na retirada";
  const remainder = finance.balanceCents > 0 ? { label: `Falta pagar · ${when}`, amount: brl(finance.balanceCents) } : null;
  return { receipts, remainder };
}
