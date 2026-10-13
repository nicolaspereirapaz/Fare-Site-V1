import { describe, expect, it } from "vitest";
import { buildHomeShowcase } from "@/lib/homeShowcase";
import type { CatalogProduct } from "@/lib/xbz";

function product(id: string, category: string, totalStock: number, imageUrl = `https://img/${id}.jpg`): CatalogProduct {
  return {
    id,
    internalCode: id,
    name: `Produto ${id}`,
    description: "",
    productUrl: "",
    imageUrl,
    category,
    subcategory: "",
    price: 10,
    formattedPrice: "R$ 10,00",
    totalStock,
    colors: [],
    variants: [],
  };
}

const CATALOG = [
  product("c1", "Canecas", 500),
  product("c2", "Canecas", 900),
  product("c3", "Canecas", 100),
  product("c4", "Canecas", 80),
  product("g1", "Garrafas", 300),
  product("g2", "Garrafas", 50, ""),
  product("g3", "Garrafas", 40),
  product("m1", "Mochilas", 10),
  product("m2", "Mochilas", 5),
  product("o1", "Outros", 9999),
  product("o2", "Outros", 9999),
  product("o3", "Outros", 9999),
  product("o4", "Outros", 9999),
  product("o5", "Outros", 9999),
];

describe("vitrine da Home (brindes do fornecedor)", () => {
  it("lista as categorias com mais produtos, sem 'Outros', com a foto do item de maior estoque", () => {
    const showcase = buildHomeShowcase(CATALOG, { categoryLimit: 2 });

    expect(showcase.total).toBe(14);
    expect(showcase.categories).toEqual([
      { name: "Canecas", count: 4, imageUrl: "https://img/c2.jpg" },
      { name: "Garrafas", count: 3, imageUrl: "https://img/g1.jpg" },
    ]);
  });

  it("destaques alternam entre categorias, só com foto, sem repetir a capa das categorias", () => {
    const showcase = buildHomeShowcase(CATALOG, { featuredLimit: 3 });

    expect(showcase.featured.map((item) => item.id)).toEqual(["c1", "g3", "m2"]);
  });

  it("a Home não repete foto: categorias, destaques e banner usam produtos diferentes", () => {
    const showcase = buildHomeShowcase(CATALOG, { featuredLimit: 2, heroLimit: 2 });
    const covers = showcase.categories.map((category) => category.imageUrl);
    const featured = showcase.featured.map((item) => item.imageUrl);
    const hero = showcase.hero.map((item) => item.imageUrl);
    const all = [...covers, ...featured, ...hero];

    expect(new Set(all).size).toBe(all.length);
    expect(hero).toHaveLength(2);
  });

  it("o banner prefere categorias que dão boa foto (canecas, garrafas, mochilas, kits)", () => {
    const catalog = [
      product("p1", "Canetas e Lápis", 900), product("p2", "Canetas e Lápis", 800), product("p3", "Canetas e Lápis", 700),
      product("k1", "Canecas, Copos e Taças", 50), product("k2", "Canecas, Copos e Taças", 40),
      product("b1", "Mochilas", 30), product("b2", "Mochilas", 20),
    ];
    const showcase = buildHomeShowcase(catalog, { categoryLimit: 3, featuredLimit: 0, heroLimit: 2 });
    expect(showcase.hero.map((item) => item.category)).toEqual(["Mochilas", "Canecas, Copos e Taças"]);
  });

  it("não repete produto, ignora sem foto e 'Outros', e respeita o limite com poucas opções", () => {
    const showcase = buildHomeShowcase(CATALOG, { featuredLimit: 50 });
    const ids = showcase.featured.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("g2");
    expect(ids.some((id) => id.startsWith("o"))).toBe(false);
  });

  it("catálogo vazio não quebra a Home", () => {
    expect(buildHomeShowcase([])).toEqual({ total: 0, categories: [], featured: [], hero: [] });
  });
});
