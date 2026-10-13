import { unitPriceForQuantity, type CampaignQuantityPricing } from "@/lib/campaignPricing";
import type { QuoteCartItem } from "@/lib/commerce";
import type { ItemCodes } from "@/lib/productCodes";

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
    const rest = { ...item };
    delete rest.costing; // composição de custo é só da equipe; nunca aceita do navegador
    return {
      ...rest,
      pricing,
      unitPrice: pricing ? unitPriceForQuantity(pricing, item.quantity) : null,
    };
  });
}

/** Códigos do brinde pelo id público + cor escolhida; null se não for brinde do catálogo. */
export type GiftCodesLookup = (publicId: string, variantLabel: string) => ItemCodes | null;

/** Grava no item os códigos para a equipe (os que vierem do navegador são descartados). */
export function attachItemCodes(items: QuoteCartItem[], lookup: GiftCodesLookup): QuoteCartItem[] {
  return items.map((item) => {
    const rest = { ...item };
    delete rest.codes;
    if (!item.slug.startsWith(GIFT_PREFIX)) return rest;
    const codes = lookup(item.slug.slice(GIFT_PREFIX.length), item.selections?.["Variação"] ?? "");
    return codes ? { ...rest, codes } : rest;
  });
}
