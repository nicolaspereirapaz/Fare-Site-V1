import type { PublicCatalogProduct } from "@/lib/publicCatalog";

/**
 * Cor de vitrine da campanha Outubro Rosa: rosa; se o produto não tiver rosa, branco;
 * sem nenhuma das duas, a primeira variação.
 * Ordem: cor exata ("Rosa") > rosa como cor principal ("Rosa / Preto") > rosa como detalhe
 * ("Branco / Rosa"), e o mesmo para branco.
 */
const PREFERRED_COLORS = ["rosa", "branco"] as const;

function colorParts(label: string): string[] {
  return label
    .replace(/\s*\(tom \d+\)\s*$/i, "")
    .split("/")
    .map((part) => part.trim().toLocaleLowerCase("pt-BR"));
}

function variantScore(label: string): number {
  const parts = colorParts(label);
  for (const [rank, color] of PREFERRED_COLORS.entries()) {
    const base = (PREFERRED_COLORS.length - rank) * 10;
    if (parts.length === 1 && parts[0] === color) return base + 3;
    if (parts[0] === color) return base + 2;
    if (parts.includes(color)) return base + 1;
  }
  return 0;
}

export function featuredVariantIndex(labels: string[]): number {
  let best = 0;
  let bestScore = -1;
  labels.forEach((label, index) => {
    const score = variantScore(label);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Coloca a variação rosa (ou branca) em primeiro lugar e usa a foto dela no card. */
export function withCampaignFeaturedColor(product: PublicCatalogProduct): PublicCatalogProduct {
  if (!product.variants.length) return product;
  const index = featuredVariantIndex(product.variants.map((variant) => variant.label));
  const featured = product.variants[index];
  return {
    ...product,
    imageUrl: featured.imageUrl || product.imageUrl,
    variants: [featured, ...product.variants.filter((_, position) => position !== index)],
  };
}
