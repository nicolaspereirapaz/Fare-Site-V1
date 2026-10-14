import type { PaymentMethod } from "@/lib/orders/repository";

/** Métodos do balcão; o checkout público continua com sua lista própria. */
export const STAFF_PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix", dinheiro: "Dinheiro", cartao_debito: "Cartão de débito", cartao_credito: "Cartão de crédito",
  boleto: "Boleto", faturamento_empresa: "Faturamento para empresa",
};
export type PaymentForm = {
  paid: string; paymentMethod: PaymentMethod; paidAt: string; installments: string; dueDate: string;
  deliveryDate: string; deliveryMode: "retirada" | "entrega";
};
export const EMPTY_PAYMENT_FORM: PaymentForm = {
  paid: "0,00", paymentMethod: "pix", paidAt: "", installments: "1", dueDate: "", deliveryDate: "", deliveryMode: "retirada",
};
export function todayInBrazil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function paidCents(text: string): number | null {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned.replace(",", ".")) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
export function paymentFormError(form: PaymentForm, totalCents: number): string | null {
  const cents = paidCents(form.paid);
  if (cents === null) return "Informe um valor pago válido (até duas casas decimais).";
  if (cents > totalCents) return "O valor pago não pode ser maior que o total do pedido.";
  if (cents > 0 && !form.paidAt) return "Informe a data do pagamento.";
  return null;
}
export function dateLabel(date: string | null | undefined): string {
  return date ? date.split("-").reverse().join("/") : "A definir";
}
