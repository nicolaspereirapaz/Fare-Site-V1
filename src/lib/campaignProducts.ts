import type { CatalogProduct } from "@/lib/xbz";

function normalizeCode(value: string): string {
  return value.trim().toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]/g, "");
}

function aliases(value: string): string[] {
  const normalized = normalizeCode(value);
  const undecorated = /^[EP]\d/.test(normalized) ? normalized.slice(1) : normalized;
  return normalized === undecorated ? [normalized] : [normalized, undecorated];
}

function productCodes(product: CatalogProduct): string[] {
  return [
    product.internalCode,
    ...product.variants.flatMap((variant) => [
      variant.familyCode,
      variant.compoundCode,
      variant.sku,
      variant.id,
    ]),
  ].filter(Boolean);
}

export function selectCampaignProducts(
  products: CatalogProduct[],
  editorialCodes: readonly string[],
): CatalogProduct[] {
  const exact = new Map<string, CatalogProduct>();
  const fallback = new Map<string, CatalogProduct>();

  for (const product of products) {
    for (const code of productCodes(product)) {
      const [primary, secondary] = aliases(code);
      if (primary && !exact.has(primary)) exact.set(primary, product);
      if (secondary && !fallback.has(secondary)) fallback.set(secondary, product);
      if (primary && !fallback.has(primary)) fallback.set(primary, product);
    }
  }

  const selected: CatalogProduct[] = [];
  const seen = new Set<string>();

  for (const editorialCode of editorialCodes) {
    const [primary, secondary] = aliases(editorialCode);
    const product = exact.get(primary) ?? (secondary ? fallback.get(secondary) : undefined) ?? fallback.get(primary);
    if (!product || seen.has(product.internalCode)) continue;
    seen.add(product.internalCode);
    selected.push(product);
  }

  return selected;
}
