import { describe, expect, it } from "vitest";
import { productCategories, products } from "../products";

describe("initial catalog", () => {
  it("contains the 12 agreed priority products", () => {
    expect(products).toHaveLength(12);
  });

  it("organizes the catalog into the three customer-facing categories", () => {
    expect(productCategories).toEqual([
      "Todos",
      "Fotografias, álbuns e molduras",
      "Brindes para sua empresa",
      "Gráfica",
    ]);

    expect(
      products.filter((product) => product.category === "Fotografias, álbuns e molduras"),
    ).toHaveLength(4);
    expect(
      products.filter((product) => product.category === "Brindes para sua empresa"),
    ).toHaveLength(4);
    expect(products.filter((product) => product.category === "Gráfica")).toHaveLength(4);
  });

  it("uses unique slugs and only owned local assets", () => {
    const slugs = products.map((product) => product.slug);

    expect(new Set(slugs).size).toBe(products.length);
    expect(products.every((product) => product.image.startsWith("/images/"))).toBe(true);
  });

  it("keeps draft prices under consultation without fabricating values", () => {
    expect(products.every((product) => product.startingPrice === null)).toBe(true);
  });

  it("offers configurable options and quantities for every product", () => {
    for (const product of products) {
      expect(product.options.length).toBeGreaterThanOrEqual(3);
      expect(product.options.every((option) => option.values.length > 0)).toBe(true);
      expect(product.quantities.length).toBeGreaterThan(0);
    }
  });
});
