export type QuoteCartItem = {
  id: string;
  productName: string;
  slug: string;
  quantity: number;
  quantityRange?: string;
  selections: Record<string, string>;
  artworkName?: string | null;
  unitPrice: number | null;
};

export type QuoteCustomer = {
  name: string;
  company?: string;
  phone?: string;
  notes?: string;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export function calculateLineTotal(
  basePrice: number | null,
  modifiers: number[],
  quantity: number,
) {
  if (basePrice === null) return null;

  const unitPrice = modifiers.reduce((total, modifier) => total + modifier, basePrice);
  return Math.round(unitPrice * Math.max(quantity, 1) * 100) / 100;
}

export function buildQuoteMessage(customer: QuoteCustomer, items: QuoteCartItem[]) {
  const customerLines = [
    "Pedido de orçamento — Fare Foto",
    "",
    `Cliente: ${customer.name}`,
    customer.company ? `Empresa: ${customer.company}` : null,
    customer.phone ? `Telefone: ${customer.phone}` : null,
    "",
  ].filter((line): line is string => Boolean(line));

  const itemLines = items.flatMap((item, index) => {
    const selectionLines = Object.entries(item.selections).map(
      ([label, value]) => `  • ${label}: ${value}`,
    );
    const total =
      item.unitPrice === null
        ? "sob consulta"
        : formatCurrency(item.unitPrice * item.quantity);

    return [
      `${index + 1}. ${item.productName}`,
      `  • Quantidade: ${item.quantityRange ?? item.quantity}`,
      ...selectionLines,
      item.artworkName ? `  • Arte: ${item.artworkName}` : "  • Arte: enviarei no WhatsApp",
      `  • Valor: ${total}`,
      "",
    ];
  });

  const notes = customer.notes ? ["Observações:", customer.notes, ""] : [];

  return [
    ...customerLines,
    ...itemLines,
    ...notes,
    "Olá! Gostaria de confirmar disponibilidade, prazo e valor deste pedido.",
  ].join("\n");
}

export function buildWhatsAppUrl(phone: string, message: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
