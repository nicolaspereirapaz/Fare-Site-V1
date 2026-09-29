import { calcularPrecoBrinde } from "@/lib/backoffice/pricing";
import type { CatalogProduct } from "@/lib/xbz";

/** Referência pública da campanha: pedido de 100 unidades, frete do fornecedor de R$ 100 por produto. */
export const CAMPAIGN_REFERENCE_QUANTITY = 100;
export const CAMPAIGN_SUPPLIER_FREIGHT = 100;

/**
 * "A partir de" = preço unitário final da variação mais barata, pela regra oficial:
 * (custo × 2 × quantidade + frete do fornecedor) ÷ quantidade. Gravação e frete ao cliente
 * ficam fora da referência e são confirmados no orçamento.
 */
export function campaignStartingPrice(product: CatalogProduct): number | null {
  return campaignUnitPrice(product.price, CAMPAIGN_REFERENCE_QUANTITY);
}

/** Quantidades exibidas na tabela da página do produto. */
export const CAMPAIGN_QUANTITY_TIERS = [50, 100, 250, 500, 1000] as const;

/** Preço unitário estimado para uma quantidade: custo × 2 + frete do fornecedor rateado. */
export function campaignUnitPrice(cost: number | null, quantity: number): number | null {
  if (cost === null || !Number.isFinite(cost) || cost <= 0 || quantity <= 0) return null;
  return calcularPrecoBrinde({
    custoProduto: cost,
    gravacaoUnitaria: 0,
    quantidade: quantity,
    freteFornecedor: CAMPAIGN_SUPPLIER_FREIGHT,
    freteCliente: 0,
  }).precoUnitarioFinal;
}

/** Tabela pública (só preço final, nunca o custo) a partir da variação mais barata. */
export function campaignPriceTiers(product: CatalogProduct): Array<{ quantity: number; unitPrice: number }> {
  return CAMPAIGN_QUANTITY_TIERS.flatMap((quantity) => {
    const unitPrice = campaignUnitPrice(product.price, quantity);
    return unitPrice === null ? [] : [{ quantity, unitPrice }];
  });
}

/**
 * Parâmetros públicos para calcular qualquer quantidade no navegador: preço de venda por
 * unidade sem frete (já com a margem ×2) e o frete do fornecedor a ratear, em centavos.
 * O custo do fornecedor não é enviado.
 */
export type CampaignQuantityPricing = { unitSaleCents: number; freightCents: number };

export function campaignQuantityPricing(product: CatalogProduct): CampaignQuantityPricing | null {
  const cost = product.price;
  if (cost === null || !Number.isFinite(cost) || cost <= 0) return null;
  return { unitSaleCents: Math.round(cost * 100) * 2, freightCents: Math.round(CAMPAIGN_SUPPLIER_FREIGHT * 100) };
}

/** Mesmo arredondamento de calcularPrecoBrinde: (venda × qtd + frete) ÷ qtd, em centavos. */
export function unitPriceForQuantity(pricing: CampaignQuantityPricing, quantity: number): number | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  return Math.round((pricing.unitSaleCents * quantity + pricing.freightCents) / quantity) / 100;
}
