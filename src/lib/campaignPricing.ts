import { calcularPrecoBrinde } from "@/lib/backoffice/pricing";
import type { CatalogProduct } from "@/lib/xbz";

/** Referência pública da campanha: pedido de 100 unidades, frete do fornecedor de R$ 80 por produto. */
export const CAMPAIGN_REFERENCE_QUANTITY = 100;
export const CAMPAIGN_SUPPLIER_FREIGHT = 80;

/**
 * "A partir de" = preço unitário final da variação mais barata, pela regra oficial:
 * (custo × 2 × quantidade + frete do fornecedor) ÷ quantidade. Gravação e frete ao cliente
 * ficam fora da referência e são confirmados no orçamento.
 */
export function campaignStartingPrice(product: CatalogProduct): number | null {
  if (product.price === null || !Number.isFinite(product.price) || product.price <= 0) return null;
  return calcularPrecoBrinde({
    custoProduto: product.price,
    gravacaoUnitaria: 0,
    quantidade: CAMPAIGN_REFERENCE_QUANTITY,
    freteFornecedor: CAMPAIGN_SUPPLIER_FREIGHT,
    freteCliente: 0,
  }).precoUnitarioFinal;
}
