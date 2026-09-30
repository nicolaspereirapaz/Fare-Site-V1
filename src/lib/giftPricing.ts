import {
  campaignPriceTiers,
  campaignQuantityPricing,
  campaignStartingPrice,
  type CampaignQuantityPricing,
} from "@/lib/campaignPricing";
import { toPublicCatalogProduct, type PublicCatalogProduct } from "@/lib/publicCatalog";
import type { CatalogProduct } from "@/lib/xbz";

/**
 * Preço dos brindes no site completo: mesma regra da campanha (custo × 2 + R$ 100 de frete do
 * fornecedor rateado; referência de 100 un.), mas visível SOMENTE para clientes com login.
 * O navegador recebe apenas o preço final — nunca o custo do fornecedor.
 */
export function toGiftProduct(product: CatalogProduct, pricesVisible: boolean): PublicCatalogProduct {
  const base = toPublicCatalogProduct(product);
  return pricesVisible ? { ...base, startingPrice: campaignStartingPrice(product) } : base;
}

export type GiftPricingDetail = {
  pricesVisible: boolean;
  priceTiers?: Array<{ quantity: number; unitPrice: number }>;
  quantityPricing?: CampaignQuantityPricing | null;
};

export function giftPricingDetail(product: CatalogProduct, pricesVisible: boolean): GiftPricingDetail {
  if (!pricesVisible) return { pricesVisible: false };
  return {
    pricesVisible: true,
    priceTiers: campaignPriceTiers(product),
    quantityPricing: campaignQuantityPricing(product),
  };
}

/**
 * A resposta muda conforme a sessão: `private, no-store` impede CDN/proxy de guardar a versão
 * com preço e entregá-la a um visitante. (Não usamos Vary: o Next.js sobrescreve esse cabeçalho.)
 */
export const MEMBER_PRICING_HEADERS = { "Cache-Control": "private, no-store" } as const;
