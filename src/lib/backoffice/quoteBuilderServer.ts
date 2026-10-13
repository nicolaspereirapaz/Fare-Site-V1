import { database } from "@/lib/auth";
import type { BuilderProduct } from "@/lib/backoffice/quoteBuilder";
import { createQuoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderHandlers";
import { isProfileComplete } from "@/lib/account/profile";
import { getCustomerProfile } from "@/lib/account/profileRepository";
import { queryCatalog } from "@/lib/catalogQuery";
import { familyKey, supplierCodeOf, supplierOf } from "@/lib/productCodes";
import { publicProductId, toPublicCatalogProduct } from "@/lib/publicCatalog";
import { readSpotCustomizations, refreshSpotCustomizationsInBackground } from "@/lib/suppliers/spotCustomizations";
import { staffAuth } from "@/lib/staff/auth";
import { groupAvailableProducts, type CatalogProduct } from "@/lib/xbz";
import { getCatalogDatabase } from "@/lib/xbzCatalogRepository";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

function toBuilderProduct(product: CatalogProduct, fareCodes: Map<string, string>): BuilderProduct {
  const first = product.variants[0];
  const supplier = supplierOf(first);
  const labels = toPublicCatalogProduct(product).variants.map((variant) => variant.label);
  let spotOptions: BuilderProduct["spotOptions"] = [];
  if (supplier === "spot") {
    const catalog = getCatalogDatabase();
    refreshSpotCustomizationsInBackground(catalog);
    spotOptions = readSpotCustomizations(catalog, first.familyCode.replace(/^spot:/, ""));
  }
  return {
    publicId: publicProductId(product.internalCode),
    name: product.name,
    category: product.category,
    imageUrl: product.imageUrl,
    fareCode: fareCodes.get(familyKey(first)) ?? "",
    supplier,
    supplierCode: supplierCodeOf(product.variants),
    variants: product.variants
      .map((variant, index) => ({
        label: labels[index],
        cost: variant.price ?? 0,
        stock: variant.stockAvailable,
        sku: variant.supplier ? variant.sku : variant.compoundCode || variant.sku,
        imageUrl: variant.imageUrl || product.imageUrl,
      }))
      .filter((variant) => variant.cost > 0),
    spotOptions,
  };
}

async function catalog() {
  const { products, fareCodes } = await getLocalCatalog();
  const grouped = groupAvailableProducts(products);
  const byId = new Map(grouped.map((product) => [publicProductId(product.internalCode), product]));
  // Na equipe a busca também acha pelo código do fornecedor (o site não).
  const codeOf = (product: CatalogProduct) => `${fareCodes.get(familyKey(product.variants[0])) ?? ""} ${supplierCodeOf(product.variants)}`;
  return {
    lookup: (publicId: string) => {
      const product = byId.get(publicId);
      return product ? toBuilderProduct(product, fareCodes) : null;
    },
    search: (query: string, limit: number) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const exact = grouped.filter((product) => codeOf(product).toLowerCase().split(/\s+/).some((code) => words.includes(code)));
      const found = exact.length ? exact : queryCatalog(grouped, { query, category: "", quantity: null, minPrice: null, maxPrice: null, sort: "relevancia", pricesVisible: true }, codeOf);
      return found.slice(0, limit).map((product) => toBuilderProduct(product, fareCodes));
    },
  };
}

export const quoteBuilderHandlers = createQuoteBuilderHandlers({
  getSession: staffAuth.api.getSession as never,
  database: () => database,
  catalog,
  readBilling: (userId) => {
    const profile = getCustomerProfile(database, userId);
    if (!isProfileComplete({ ...profile, name: "cliente" })) return null;
    const { personType, document, companyName, tradeName, stateRegistration, address } = profile;
    return { personType, document, companyName, tradeName, stateRegistration, address };
  },
});
