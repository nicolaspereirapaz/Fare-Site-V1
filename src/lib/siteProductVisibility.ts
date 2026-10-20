/** Oculta itens fora da oferta sem apagar dados do fornecedor ou pedidos antigos. */
export function isSiteProductVisible(product: { name: string; description?: string; familyCode?: string }): boolean {
  // S11082: caixa Spot 97349, explicitamente removida da oferta.
  if (product.familyCode === "spot:97349") return false;
  if (/\b(?:camisetas?|t[ -]?shirts?)\b/i.test(product.name)) return false;
  const description = (product.description ?? "").replace(/<[^>]*>/g, " ");
  return !/\b(?:venda|vendid[oa]s?|comercializad[oa]s?)\s+(?:exclusiv[ao]s?|exclusivamente|somente|apenas)\s+(?:em\s+)?conjunto\b/i.test(description);
}
