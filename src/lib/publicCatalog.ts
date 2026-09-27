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
};

export function publicProductId(internalCode: string): string {
  return createHash("sha256").update(`farefoto:product:${internalCode}`).digest("hex").slice(0, 16);
}

function publicVariantId(productCode: string, variant: Product): string {
  const source = variant.sku || variant.compoundCode || variant.id;
  return createHash("sha256").update(`farefoto:variant:${productCode}:${source}`).digest("hex").slice(0, 16);
}

function variantLabel(variant: Product): string {
  return [variant.primaryColor, variant.secondaryColor].filter(Boolean).join(" / ") || "Padrão";
}

export function toPublicCatalogProduct(product: CatalogProduct): PublicCatalogProduct {
  return {
    publicId: publicProductId(product.internalCode),
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    category: product.category,
    subcategory: product.subcategory,
    colors: product.colors,
    variants: product.variants.map((variant) => ({
      publicId: publicVariantId(product.internalCode, variant),
      label: variantLabel(variant),
    })),
  };
}
