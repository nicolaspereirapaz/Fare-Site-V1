import { describe, expect, it } from "vitest";
import { parseCatalogParams, queryCatalog, unitPriceFor } from "@/lib/catalogQuery";
import type { CatalogProduct, Product } from "@/lib/xbz";

function variant(overrides: Partial<Product> = {}): Product {
  return {
    id: "v", sku: "v", compoundCode: "v", familyCode: "f", name: "x", description: "", productUrl: "", imageUrl: "x.jpg",
    category: "Canecas, Copos e Taças", subcategory: "", primaryColor: "Azul", secondaryColor: "", price: 1, formattedPrice: "",
    clearance: false, stockMain: 0, stockAvailable: 500, reliability: "", restockDate: "", ...overrides,
  };
}

function product(code: string, name: string, options: { price?: number | null; stocks?: number[]; category?: string; description?: string } = {}): CatalogProduct {
  const stocks = options.stocks ?? [500];
  const variants = stocks.map((stock, index) => variant({
    id: `${code}-${index}`, sku: `${code}-${index}`, familyCode: code, name, stockAvailable: stock,
    primaryColor: ["Azul", "Preto", "Branco", "Verde", "Vermelho"][index] ?? `Cor ${index}`, price: options.price ?? 1,
  }));
  return {
    id: code, internalCode: code, name, description: options.description ?? "", productUrl: "", imageUrl: "x.jpg",
    category: options.category ?? "Canecas, Copos e Taças", subcategory: "", price: options.price === undefined ? 1 : options.price,
    formattedPrice: "", totalStock: stocks.reduce((sum, stock) => sum + stock, 0), colors: variants.map((item) => item.primaryColor), variants,
  };
}

const CANECA = product("A", "CANECA TÉRMICA 350ML", { price: 5, stocks: [1000, 50] });
const CANETA = product("B", "CANETA PLÁSTICA", { price: 0.82, stocks: [80, 90, 70], category: "Canetas e Lápis" });
const GARRAFA = product("C", "GARRAFA INOX 500ML", { price: 12, stocks: [300], category: "Garrafas e Squeezes", description: "Garrafa térmica de inox" });
const SEM_PRECO = product("D", "CANECA DE CERÂMICA", { price: null, stocks: [5000] });
const ALL = [CANECA, CANETA, GARRAFA, SEM_PRECO];

const base = { query: "", category: "", quantity: null, minPrice: null, maxPrice: null, sort: "relevancia" as const, pricesVisible: true };
const names = (list: CatalogProduct[]) => list.map((item) => item.internalCode);

describe("filtros do catálogo", () => {
  it("quantidade: só brindes com estoque para ela em pelo menos uma cor", () => {
    expect(names(queryCatalog(ALL, { ...base, quantity: 100 }))).toEqual(expect.arrayContaining(["A", "C", "D"]));
    expect(names(queryCatalog(ALL, { ...base, quantity: 100 }))).not.toContain("B"); // 80+90+70 somados não valem: é por cor
    expect(names(queryCatalog(ALL, { ...base, quantity: 1000 })).sort()).toEqual(["A", "D"]);
  });

  it("preço por unidade, calculado para a quantidade pedida (100 un. quando não informada)", () => {
    // caneta: 0,82 × 2 + R$ 100 ÷ 100 = 2,64 | caneca: 5 × 2 + 1 = 11 | garrafa: 12 × 2 + 1 = 25
    expect(unitPriceFor(CANETA, null)).toBe(2.64);
    expect(unitPriceFor(CANECA, 1000)).toBe(10.1);
    expect(names(queryCatalog(ALL, { ...base, minPrice: 5, maxPrice: 20 }))).toEqual(["A"]);
    expect(names(queryCatalog(ALL, { ...base, maxPrice: 3 }))).toEqual(["B"]); // sem preço fica de fora quando há filtro de preço
  });

  it("busca sem acento e por palavras soltas", () => {
    expect(names(queryCatalog(ALL, { ...base, query: "caneca termica" }))).toEqual(["A"]);
    expect(names(queryCatalog(ALL, { ...base, query: "inox" }))).toEqual(["C"]);
    expect(names(queryCatalog(ALL, { ...base, query: "termica" }))).toEqual(["A", "C"]); // nome antes da descrição
  });

  it("categoria", () => {
    expect(names(queryCatalog(ALL, { ...base, category: "Canetas e Lápis" }))).toEqual(["B"]);
  });
});

describe("ordenação", () => {
  it("menor e maior preço (sem preço vai para o fim)", () => {
    expect(names(queryCatalog(ALL, { ...base, sort: "menor-preco" }))).toEqual(["B", "A", "C", "D"]);
    expect(names(queryCatalog(ALL, { ...base, sort: "maior-preco" }))).toEqual(["C", "A", "B", "D"]);
  });

  it("mais opções de cor e nome", () => {
    expect(names(queryCatalog(ALL, { ...base, sort: "mais-cores" }))[0]).toBe("B");
    expect(names(queryCatalog(ALL, { ...base, sort: "nome" }))).toEqual(["D", "A", "B", "C"]);
  });

  it("mais relevantes sem busca alterna categorias, para a 1ª página não ficar só com um tipo", () => {
    const list = names(queryCatalog(ALL, base));
    expect(list.slice(0, 3).map((code) => ALL.find((item) => item.internalCode === code)?.category))
      .toEqual(expect.arrayContaining(["Canecas, Copos e Taças", "Canetas e Lápis", "Garrafas e Squeezes"]));
  });
});

describe("parâmetros da URL", () => {
  it("lê quantidade, preço (com vírgula) e ordem", () => {
    const parsed = parseCatalogParams(new URLSearchParams("qtd=250&precoMin=2,5&precoMax=10&ordem=menor-preco&q=Caneca&categoria=Mochilas"), true);
    expect(parsed).toEqual({ query: "caneca", category: "Mochilas", quantity: 250, minPrice: 2.5, maxPrice: 10, sort: "menor-preco", pricesVisible: true });
  });

  it("visitante não filtra nem ordena por preço (o preço é só para cadastrados)", () => {
    const parsed = parseCatalogParams(new URLSearchParams("precoMin=1&precoMax=2&ordem=menor-preco&qtd=100"), false);
    expect(parsed).toMatchObject({ minPrice: null, maxPrice: null, sort: "relevancia", quantity: 100 });
  });

  it("descarta valores inválidos", () => {
    const parsed = parseCatalogParams(new URLSearchParams("qtd=-5&precoMin=abc&ordem=hack"), true);
    expect(parsed).toMatchObject({ quantity: null, minPrice: null, sort: "relevancia" });
  });
});
