import { createHash } from "node:crypto";
import type { CatalogProduct, Product } from "@/lib/xbz";

export type PublicCatalogVariant = {
  publicId: string;
  label: string;
};

export type PublicProductsResponse = {
  products: PublicCatalogProduct[];
  categories?: Array<{ name: string; count: number }>;
  meta: {
    total: number;
    page: number;
    limit: number;
    fetchedAt: string;
    cached: boolean;
  };
};

export type PublicCatalogProduct = {
  publicId: string;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  subcategory: string;
  colors: string[];
  variants: PublicCatalogVariant[];
  /** Somente na campanha: preço unitário de referência já calculado (nunca o custo). */
  startingPrice?: number | null;
};

export function publicProductId(internalCode: string): string {
  return createHash("sha256").update(`farefoto:product:${internalCode}`).digest("hex").slice(0, 16);
}

function publicVariantId(productCode: string, variant: Product): string {
  const source = variant.sku || variant.compoundCode || variant.id;
  return createHash("sha256").update(`farefoto:variant:${productCode}:${source}`).digest("hex").slice(0, 16);
}

function titleCaseColor(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s/-])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toLocaleUpperCase("pt-BR"));
}

/** "PRETO / PRETO" → "Preto"; "AZUL / BRANCO" → "Azul / Branco". */
export function variantLabel(variant: Pick<Product, "primaryColor" | "secondaryColor">): string {
  const colors = Array.from(new Set(
    [variant.primaryColor, variant.secondaryColor].map((color) => color.trim()).filter(Boolean).map(titleCaseColor),
  ));
  return colors.join(" / ") || "Padrão";
}

export function toPublicCatalogProduct(product: CatalogProduct): PublicCatalogProduct {
  // Tons diferentes com o mesmo nome de cor ("Azul", "Azul") viram "Azul" e "Azul (tom 2)".
  const seen = new Map<string, number>();
  const labels = product.variants.map((variant) => {
    const label = variantLabel(variant);
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label} (tom ${count})`;
  });
  return {
    publicId: publicProductId(product.internalCode),
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    category: product.category,
    subcategory: product.subcategory,
    colors: product.colors,
    variants: product.variants.map((variant, index) => ({
      publicId: publicVariantId(product.internalCode, variant),
      label: labels[index],
    })),
  };
}
