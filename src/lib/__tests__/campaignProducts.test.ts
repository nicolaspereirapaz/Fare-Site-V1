import { describe, expect, it } from "vitest";
import { selectCampaignProducts } from "@/lib/campaignProducts";
import type { CatalogProduct, Product } from "@/lib/xbz";

function variant(overrides: Partial<Product>): Product {
  return {
    id: "1", sku: "SKU", compoundCode: "", familyCode: "", name: "Produto",
    description: "", productUrl: "", imageUrl: "", category: "Outros", subcategory: "",
    primaryColor: "", secondaryColor: "", price: 1, formattedPrice: "R$ 1,00",
    clearance: false, stockMain: 1, stockAvailable: 1, reliability: "", restockDate: "",
    ...overrides,
  };
}

function product(internalCode: string, codes: Partial<Product> = {}): CatalogProduct {
  const item = variant({ familyCode: internalCode, ...codes });
  return {
    id: internalCode, internalCode, name: item.name, description: "", productUrl: "",
    imageUrl: "", category: "Outros", subcategory: "", price: 1,
    formattedPrice: "R$ 1,00", totalStock: 1, colors: [], variants: [item],
  };
}

describe("selectCampaignProducts", () => {
  it("preserva a ordem editorial e ignora códigos ausentes", () => {
    const a = product("09323");
    const b = product("19228");
    expect(selectCampaignProducts([a, b], ["19228", "inexistente", "09323"]))
      .toEqual([b, a]);
  });

  it("encontra códigos decorados E@ e P@ sem duplicar famílias", () => {
    const e = product("09292", { sku: "E@09292" });
    const p = product("05055", { compoundCode: "P@05055" });
    expect(selectCampaignProducts([e, p], ["E@09292", "P@05055", "09292"]))
      .toEqual([e, p]);
  });

  it("também encontra o código em uma variante", () => {
    const item = product("FAMILIA-X", { sku: "19179-ROSA" });
    expect(selectCampaignProducts([item], ["19179-ROSA"])).toEqual([item]);
  });
});
