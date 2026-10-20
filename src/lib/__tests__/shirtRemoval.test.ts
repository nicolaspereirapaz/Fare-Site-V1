import { describe, expect, it } from "vitest";
import { products, getProductBySlug } from "@/data/products";
import { isSiteProductVisible } from "@/lib/siteProductVisibility";

describe("restrições de venda no catálogo", () => {
  it("oculta produtos cuja venda exige outro produto", () => {
    for (const description of [
      "Caixa transparente. Venda exclusiva em conjunto com pen drive",
      "VENDA EXCLUSIVA EM CONJUNTO COM GARRAFA",
      "Venda exclusiva\n em conjunto com caneca",
      "Vendido exclusivamente em conjunto com outro produto",
    ]) {
      expect(isSiteProductVisible({ name: "Embalagem", description })).toBe(false);
    }
  });

  it("mantém S11082 oculto pela família mesmo se o fornecedor alterar a descrição", () => {
    expect(isSiteProductVisible({ name: "Caixa para pen drive", familyCode: "spot:97349" })).toBe(false);
  });

  it("não confunde kits normais e sugestões de uso com venda condicionada", () => {
    for (const description of ["Conjunto exclusivo de facas", "Ideal para usar em conjunto com caneca", "Venda do conjunto com 6 peças", "Exclusiva para fixação em mochilas"]) {
      expect(isSiteProductVisible({ name: "Produto", description })).toBe(true);
    }
  });
});

describe("camisetas fora da loja", () => {
  it("oculta camisetas dos fornecedores sem esconder outros produtos", () => {
    for (const name of ["Camiseta feminina", "Camiseta unissex de corte regular", "CAMISETAS PERSONALIZADAS", "T-shirt algodão"]) {
      expect(isSiteProductVisible({ name })).toBe(false);
    }
    for (const name of ["Caneca", "Chaveiro poliéster", "Camisa polo", "Mochila"]) {
      expect(isSiteProductVisible({ name })).toBe(true);
    }
  });
  it("não oferece camiseta no catálogo local nem por link direto", () => {
    expect(products.some((product) => /camisetas?/i.test(product.name))).toBe(false);
    expect(getProductBySlug("camiseta-personalizada")).toBeUndefined();
  });
});
