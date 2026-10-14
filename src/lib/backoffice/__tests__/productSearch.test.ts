import { describe, expect, it } from "vitest";
import { browseStaffCatalog, parseStaffFilters, type StaffEntry } from "@/lib/backoffice/productSearch";
import { colorGroupOf } from "@/lib/colorGroups";

const entry = (ref: string, supplier: StaffEntry<string>["supplier"], variants: StaffEntry<string>["variants"], category = "Canetas e Lápis"): StaffEntry<string> =>
  ({ ref, name: ref, supplier, category, variants });

const CATALOG = [
  entry("caneta", "xbz", [{ label: "Azul", cost: 0.72, stock: 5000 }, { label: "Preto", cost: 0.7, stock: 80 }]),
  entry("mochila", "spot", [{ label: "Azul Royal / Prata", cost: 85, stock: 300 }], "Mochilas"),
  entry("garrafa", "asia", [{ label: "Branco", cost: 12.5, stock: 1200 }, { label: "Inox", cost: 15, stock: 40 }], "Garrafas e Squeezes"),
  entry("zerada", "xbz", [{ label: "Azul", cost: 0, stock: 9000 }]),
];
const filters = (query: string) => parseStaffFilters(new URLSearchParams(query));

describe("grupos de cor", () => {
  it("variações caem no grupo da cor principal", () => {
    expect(colorGroupOf("Azul (tom 2)")).toBe("Azul");
    expect(colorGroupOf("Azul Royal / Prata")).toBe("Azul");
    expect(colorGroupOf("Azul Claro")).toBe("Azul claro");
    expect(colorGroupOf("Vinho")).toBe("Bordô");
    expect(colorGroupOf("Cromado Satinado")).toBe("Prata");
    expect(colorGroupOf("Salmão")).toBe("Rosa");
    expect(colorGroupOf("Padrão")).toBe("Outras");
  });
});

describe("busca de produto da equipe", () => {
  it("lê os parâmetros com limites (fornecedor e ordem desconhecidos viram padrão)", () => {
    expect(filters("fornecedor=abc&ordem=x&pagina=-2&porPagina=999&custoMin=1,5&estoqueMin=100")).toMatchObject({
      supplier: "", sort: "relevancia", page: 1, pageSize: 60, minCost: 1.5, minStock: 100,
    });
  });

  it("sem filtro mostra tudo que tem custo, na ordem de relevância recebida", () => {
    const result = browseStaffCatalog(CATALOG, filters(""));
    expect(result.items.map((item) => item.ref)).toEqual(["caneta", "mochila", "garrafa"]);
    expect(result.colorCounts).toEqual({ Azul: 2, Preto: 1, Branco: 1, Inox: 1 });
  });

  it("estoque mínimo vale por cor (não soma cores) e o card mostra só as cores que atendem", () => {
    const result = browseStaffCatalog(CATALOG, filters("estoqueMin=1000"));
    expect(result.items).toEqual([
      { ref: "caneta", match: { cost: 0.72, stock: 5000, colors: 1 } },
      { ref: "garrafa", match: { cost: 12.5, stock: 1200, colors: 1 } },
    ]);
  });

  it("grupo de cor, fornecedor, categoria e faixa de custo", () => {
    expect(browseStaffCatalog(CATALOG, filters("cor=Azul")).items.map((item) => item.ref)).toEqual(["caneta", "mochila"]);
    expect(browseStaffCatalog(CATALOG, filters("fornecedor=asia")).items.map((item) => item.ref)).toEqual(["garrafa"]);
    expect(browseStaffCatalog(CATALOG, filters("categoria=Mochilas")).items.map((item) => item.ref)).toEqual(["mochila"]);
    expect(browseStaffCatalog(CATALOG, filters("custoMin=10&custoMax=50")).items.map((item) => item.ref)).toEqual(["garrafa"]);
  });

  it("contagem por cor respeita os outros filtros mas não o próprio filtro de cor", () => {
    expect(browseStaffCatalog(CATALOG, filters("cor=Azul&fornecedor=xbz")).colorCounts).toEqual({ Azul: 1, Preto: 1 });
  });

  it("ordena por custo, estoque e nome", () => {
    const order = (sort: string) => browseStaffCatalog(CATALOG, filters(`ordem=${sort}`)).items.map((item) => item.ref);
    expect(order("menor-custo")).toEqual(["caneta", "garrafa", "mochila"]);
    expect(order("maior-custo")).toEqual(["mochila", "garrafa", "caneta"]);
    expect(order("mais-estoque")).toEqual(["caneta", "garrafa", "mochila"]);
    expect(order("nome")).toEqual(["caneta", "garrafa", "mochila"]);
  });

  it("pagina e não passa da última página", () => {
    const result = browseStaffCatalog(CATALOG, filters("porPagina=2&pagina=9"));
    expect(result).toMatchObject({ total: 3, pages: 2, page: 2 });
    expect(result.items.map((item) => item.ref)).toEqual(["garrafa"]);
  });
});
