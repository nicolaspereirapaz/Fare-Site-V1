import { describe, expect, it } from "vitest";
import { toPublicCatalogProduct } from "@/lib/publicCatalog";
import type { CatalogProduct } from "@/lib/xbz";

const product: CatalogProduct = {
  id: "family-42",
  internalCode: "INTERNAL-42",
  name: "CANECA TÉRMICA",
  description: "Caneca para personalizar",
  productUrl: "https://supplier.example/product/42",
  imageUrl: "https://supplier.example/image.jpg",
  category: "Canecas e copos",
  subcategory: "Térmicos",
  price: 19.9,
  formattedPrice: "19,90",
  totalStock: 12,
  colors: ["Preto"],
  variants: [{
    id: "variant-id",
    sku: "SKU-SECRET",
    compoundCode: "COMPOUND-SECRET",
    familyCode: "FAMILY-SECRET",
    name: "CANECA TÉRMICA",
    description: "Caneca para personalizar",
    productUrl: "https://supplier.example/product/42",
    imageUrl: "https://supplier.example/image.jpg",
    category: "Canecas e copos",
    subcategory: "Térmicos",
    primaryColor: "Preto",
    secondaryColor: "",
    price: 19.9,
    formattedPrice: "19,90",
    clearance: false,
    stockMain: 12,
    stockAvailable: 12,
    reliability: "ok",
    restockDate: "",
  }],
};

describe("toPublicCatalogProduct", () => {
  it("expõe somente dados comerciais seguros do catálogo de brindes", () => {
    const result = toPublicCatalogProduct(product);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      publicId: expect.stringMatching(/^[a-f0-9]{16}$/),
      name: "CANECA TÉRMICA",
      category: "Canecas e copos",
      colors: ["Preto"],
      variants: [{ publicId: expect.any(String), label: "Preto" }],
    });
    expect(serialized).not.toContain("INTERNAL-42");
    expect(serialized).not.toContain("SKU-SECRET");
    expect(serialized).not.toContain("COMPOUND-SECRET");
    expect(serialized).not.toContain("19.9");
    expect(serialized).not.toContain("19,90");
    expect(result).not.toHaveProperty("internalCode");
    expect(result).not.toHaveProperty("price");
  });
});
