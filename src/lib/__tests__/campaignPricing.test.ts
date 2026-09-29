import { describe, expect, it } from "vitest";
import { campaignPriceTiers, campaignQuantityPricing, campaignStartingPrice, campaignUnitPrice, unitPriceForQuantity } from "@/lib/campaignPricing";
import type { CatalogProduct } from "@/lib/xbz";

function product(price: number | null): CatalogProduct {
  return {
    id: "1", internalCode: "1", name: "Copo", description: "", productUrl: "", imageUrl: "",
    category: "Canecas e copos", subcategory: "", price, formattedPrice: "", totalStock: 10,
    colors: [], variants: [],
  };
}

describe("preço de referência da campanha", () => {
  it("aplica custo × 2 com R$ 100 de frete rateado em 100 unidades", () => {
    expect(campaignStartingPrice(product(5))).toBe(11);
    expect(campaignStartingPrice(product(3.37))).toBe(7.74);
  });

  it("não exibe preço quando o custo é desconhecido", () => {
    expect(campaignStartingPrice(product(null))).toBeNull();
    expect(campaignStartingPrice(product(0))).toBeNull();
    expect(campaignPriceTiers(product(null))).toEqual([]);
  });

  it("rateia o frete conforme a quantidade da tabela", () => {
    expect(campaignPriceTiers(product(5))).toEqual([
      { quantity: 50, unitPrice: 12 },
      { quantity: 100, unitPrice: 11 },
      { quantity: 250, unitPrice: 10.4 },
      { quantity: 500, unitPrice: 10.2 },
      { quantity: 1000, unitPrice: 10.1 },
    ]);
  });

  it("calcula qualquer quantidade no navegador igual à regra oficial", () => {
    const item = product(3.37);
    const pricing = campaignQuantityPricing(item)!;
    for (const quantity of [1, 7, 50, 100, 137, 300, 999, 2500]) {
      expect(unitPriceForQuantity(pricing, quantity)).toBe(campaignUnitPrice(3.37, quantity));
    }
    expect(unitPriceForQuantity(pricing, 300)).toBe(7.07);
    expect(unitPriceForQuantity(pricing, 0)).toBeNull();
    expect(campaignQuantityPricing(product(null))).toBeNull();
  });
});
