import { unitPriceForQuantity, type CampaignQuantityPricing } from "@/lib/campaignPricing";
import type { QuoteCartItem } from "@/lib/commerce";

const GIFT_PREFIX = "brindes/";

/** Preço público de um brinde pelo id público do catálogo; null se não existir ou não tiver preço. */
export type GiftPricingLookup = (publicId: string) => CampaignQuantityPricing | null;

/**
 * O valor do pedido é calculado no servidor: o que vem do navegador (unitPrice/pricing) é descartado.
 * - Brindes ("brindes/<id>"): mesma regra da página (custo × 2 + frete rateado) para a quantidade pedida.
 * - Demais produtos ou brinde fora do catálogo: "sob consulta" (null), confirmado no WhatsApp.
 */
export function repriceCartItems(items: QuoteCartItem[], lookup: GiftPricingLookup): QuoteCartItem[] {
  return items.map((item) => {
    const pricing = item.slug.startsWith(GIFT_PREFIX) ? lookup(item.slug.slice(GIFT_PREFIX.length)) : null;
    return {
      ...item,
      pricing,
      unitPrice: pricing ? unitPriceForQuantity(pricing, item.quantity) : null,
    };
  });
}
