import { buildQuoteMessage, buildWhatsAppUrl, type QuoteCartItem, type QuoteCustomer } from "@/lib/commerce";

export const OUTUBRO_ROSA_WHATSAPP = "5511953147703";

export function buildOutubroRosaQuoteUrl(customer: QuoteCustomer, items: QuoteCartItem[]) {
  return buildWhatsAppUrl(OUTUBRO_ROSA_WHATSAPP, buildQuoteMessage(customer, items));
}
