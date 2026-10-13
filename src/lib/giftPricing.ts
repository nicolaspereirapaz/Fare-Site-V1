import {
  campaignPriceTiers,
  campaignQuantityPricing,
  campaignStartingPrice,
  type CampaignQuantityPricing,
} from "@/lib/campaignPricing";
import { toPublicCatalogProduct, type PublicCatalogProduct } from "@/lib/publicCatalog";
import { familyKey } from "@/lib/productCodes";
import type { CatalogProduct } from "@/lib/xbz";

/**
 * Preço dos brindes no site completo: mesma regra da campanha (custo × 2 + R$ 100 de frete do
 * fornecedor rateado; referência de 100 un.), mas visível SOMENTE para clientes com login.
 * O navegador recebe apenas o preço final — nunca o custo do fornecedor.
 */
export function toGiftProduct(
  product: CatalogProduct,
  pricesVisible: boolean,
  fareCodes?: Map<string, string>,
): PublicCatalogProduct {
  const base = toPublicCatalogProduct(product);
  if (!pricesVisible) return base;
  const code = product.variants[0] ? fareCodes?.get(familyKey(product.variants[0])) : undefined;
  return { ...base, startingPrice: campaignStartingPrice(product), ...(code ? { code } : {}) };
}

/** Código Fare Foto do produto agrupado (ou undefined). */
export function fareCodeOf(product: CatalogProduct, fareCodes?: Map<string, string>): string | undefined {
  return product.variants[0] ? fareCodes?.get(familyKey(product.variants[0])) : undefined;
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
