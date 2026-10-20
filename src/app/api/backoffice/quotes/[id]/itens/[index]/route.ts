import { database } from "@/lib/auth";
import { createQuotePricingHandlers } from "@/lib/backoffice/quotePricing";
import { familyKey, supplierCodeOf, supplierOf, SUPPLIER_LABELS } from "@/lib/productCodes";
import { publicProductId, toPublicCatalogProduct } from "@/lib/publicCatalog";
import { findQuoteById, priceQuoteItem } from "@/lib/quotes/repository";
import { readSpotCustomizations, refreshSpotCustomizationsInBackground } from "@/lib/suppliers/spotCustomizations";
import { readStaffSession } from "@/lib/staff/server";
import { groupAvailableProducts } from "@/lib/xbz";
import { getCatalogDatabase } from "@/lib/xbzCatalogRepository";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

export const dynamic = "force-dynamic";

const handlers = createQuotePricingHandlers({
  getSession: readStaffSession,
  findQuote: (quoteId) => findQuoteById(database, quoteId),
  // Custo do produto pelo catálogo local: a cor escolhida no orçamento (ou a mais barata).
  lookupProduct: async (quote, itemIndex) => {
    const item = quote.items[itemIndex];
    if (!item?.slug.startsWith("brindes/")) return null;
    const { products, fareCodes } = await getLocalCatalog();
    const product = groupAvailableProducts(products).find((entry) => publicProductId(entry.internalCode) === item.slug.slice("brindes/".length));
    if (!product) return null;
    const labels = toPublicCatalogProduct(product).variants.map((variant) => variant.label);
    const chosen = product.variants[labels.indexOf(item.selections?.["Variação"] ?? "")] ?? null;
    const first = product.variants[0];
    const supplier = supplierOf(first);
    return {
      name: product.name,
      category: product.category,
      supplier,
      cost: chosen?.price ?? product.price,
      fareCode: fareCodes.get(familyKey(first)) ?? "",
      supplierCode: `${SUPPLIER_LABELS[supplier]} ${supplierCodeOf(product.variants)}`,
      spotReference: supplier === "spot" ? first.familyCode.replace(/^spot:/, "") : null,
    };
  },
  spotOptions: (reference) => {
    const catalog = getCatalogDatabase();
    refreshSpotCustomizationsInBackground(catalog);
    return readSpotCustomizations(catalog, reference);
  },
  saveItem: (input) => priceQuoteItem(database, input),
});

type Context = { params: Promise<{ id: string; index: string }> };

export async function GET(request: Request, context: Context) {
  const { id, index } = await context.params;
  return handlers.read(request, id, Number.parseInt(index, 10));
}

export async function POST(request: Request, context: Context) {
  const { id, index } = await context.params;
  return handlers.price(request, id, Number.parseInt(index, 10));
}
