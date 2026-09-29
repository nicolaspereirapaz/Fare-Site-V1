import { buildWhatsAppUrl, type QuoteCustomer } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { cartItemColor, cartItemSubtotal, cartItemUnitPrice, summarizeCart, type CampaignCartItem } from "@/lib/outubroRosaCart";

/** A campanha usa o mesmo WhatsApp do site (fonte única em constants.ts). */
export const OUTUBRO_ROSA_WHATSAPP = FARE_FOTO_WHATSAPP;

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (value: number) => currency.format(value).replace(/\u00a0/g, " ");

/** Mensagem de orçamento da campanha, com o valor estimado de cada item e o total. */
export function buildOutubroRosaQuoteMessage(customer: QuoteCustomer, items: CampaignCartItem[]): string {
  const summary = summarizeCart(items);
  const lines = [
    "Pedido de orçamento — Outubro Rosa (Fare Foto)",
    "",
    `Cliente: ${customer.name}`,
    customer.company ? `Empresa: ${customer.company}` : null,
    customer.phone ? `WhatsApp: ${customer.phone}` : null,
    "",
    ...items.flatMap((item, index) => {
      const unit = cartItemUnitPrice(item);
      const subtotal = cartItemSubtotal(item);
      const color = cartItemColor(item);
      return [
        `${index + 1}. ${item.productName}`,
        color ? `  • Cor: ${color}` : null,
        `  • Quantidade: ${item.quantity} un.`,
        unit !== null && subtotal !== null
          ? `  • Valor estimado: ${brl(unit)}/un. — subtotal ${brl(subtotal)}`
          : "  • Valor: sob consulta",
        "",
      ];
    }),
    summary.total > 0
      ? `Total estimado: ${brl(summary.total)}${summary.hasUnpriced ? " (sem os itens sob consulta)" : ""}`
      : null,
    "Valores estimados; personalização, frete e prazo a confirmar.",
    "",
    customer.notes ? `Observações: ${customer.notes}` : null,
    customer.notes ? "" : null,
    "Olá! Gostaria de confirmar disponibilidade, prazo e valor deste pedido.",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function buildOutubroRosaQuoteUrl(customer: QuoteCustomer, items: CampaignCartItem[]) {
  return buildWhatsAppUrl(OUTUBRO_ROSA_WHATSAPP, buildOutubroRosaQuoteMessage(customer, items));
}