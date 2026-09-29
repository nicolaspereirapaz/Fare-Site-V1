import { describe, expect, it } from "vitest";
import { campaignStartingPrice } from "@/lib/campaignPricing";
import type { CatalogProduct } from "@/lib/xbz";

function product(price: number | null): CatalogProduct {
  return {
    id: "1", internalCode: "1", name: "Copo", description: "", productUrl: "", imageUrl: "",
    category: "Canecas e copos", subcategory: "", price, formattedPrice: "", totalStock: 10,
    colors: [], variants: [],
  };
}

describe("preço de referência da campanha", () => {
  it("aplica custo × 2 com R$ 80 de frete rateado em 100 unidades", () => {
    expect(campaignStartingPrice(product(5))).toBe(10.8);
    expect(campaignStartingPrice(product(3.37))).toBe(7.54);
  });

  it("não exibe preço quando o custo é desconhecido", () => {
    expect(campaignStartingPrice(product(null))).toBeNull();
    expect(campaignStartingPrice(product(0))).toBeNull();
  });
});
