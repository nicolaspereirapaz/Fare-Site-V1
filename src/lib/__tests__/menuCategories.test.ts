import { describe, expect, it } from "vitest";
import { buildMenuCategories } from "@/lib/menuCategories";
import type { CatalogProduct } from "@/lib/xbz";

const product = (id: string, category: string) => ({ id, category }) as CatalogProduct;

describe("categorias do menu Brindes", () => {
  it("lista as maiores categorias primeiro, sem Outros", () => {
    const categories = buildMenuCategories([
      product("1", "Pet"),
      product("2", "Mochilas"),
      product("3", "Outros"),
      product("4", "Mochilas"),
      product("5", "Chaveiros"),
    ]);

    expect(categories).toEqual([
      { name: "Mochilas", count: 2 },
      { name: "Chaveiros", count: 1 },
      { name: "Pet", count: 1 },
    ]);
  });
});
