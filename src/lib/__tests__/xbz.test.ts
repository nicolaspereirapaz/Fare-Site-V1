import { describe, expect, it } from "vitest";
import { groupAvailableProducts, inferCategory, normalizeProduct, normalizeProducts, sentenceCaseProductName } from "../xbz";

describe("apresentação dos produtos", () => {
  it("exibe nomes em caixa normal com apenas a inicial maiúscula", () => {
    expect(sentenceCaseProductName("CANECA TÉRMICA INOX 500ML")).toBe("Caneca térmica inox 500ml");
    expect(sentenceCaseProductName("mochila executiva")).toBe("Mochila executiva");
  });
});

describe("normalização de produtos XBZ", () => {
  it("converte os campos legados da API", () => {
    const product = normalizeProduct({
      IdProduto: 42,
      CodigoXbz: "XBZ-42",
      Nome: "Caneca azul",
      CorWebPrincipal: "Azul",
      PrecoVenda: "12,50",
      QuantidadeDisponivelEstoquePrincipal: 8,
      QuantidadeDisponivel: "6",
      PontaDeEstoque: true,
    });

    expect(product).toMatchObject({
      id: "42",
      sku: "XBZ-42",
      name: "Caneca azul",
      primaryColor: "Azul",
      price: 12.5,
      stockMain: 8,
      stockAvailable: 6,
      clearance: true,
    });
  });

  it("aceita a estrutura documentada com nomes camelCase", () => {
    const [product] = normalizeProducts([{ id: 7, codigoXbz: "DOC-7", descricao: "Produto documentado" }]);
    expect(product).toMatchObject({ id: "7", sku: "DOC-7", name: "Produto documentado" });
  });

  it("rejeita respostas fora do contrato", () => {
    expect(() => normalizeProducts({ mensagem: "erro" })).toThrow(/formato/);
  });
});

describe("categorização do catálogo", () => {
  it("preserva a categoria informada pelo fornecedor", () => {
    expect(inferCategory("Caneca térmica", "Linha Premium")).toBe("Linha Premium");
  });

  it("infere uma categoria pelo nome quando ela não existe", () => {
    expect(inferCategory("CANECA ACRÍLICA 400 ML", "")).toBe("Canecas e copos");
    expect(inferCategory("MOCHILA PARA NOTEBOOK", "")).toBe("Bolsas e mochilas");
  });
});

describe("agrupamento das variações", () => {
  it("agrupa cores pelo código interno e remove variações sem estoque", () => {
    const products = normalizeProducts([
      { IdProduto: 1, CodigoXbz: "SKU-AZ", CodigoAmigavel: "INT-10", Nome: "Caneca", CorWebPrincipal: "AZUL", QuantidadeDisponivel: 5 },
      { IdProduto: 2, CodigoXbz: "SKU-VM", CodigoAmigavel: "INT-10", Nome: "Caneca", CorWebPrincipal: "VERMELHO", QuantidadeDisponivel: 3 },
      { IdProduto: 3, CodigoXbz: "SKU-PT", CodigoAmigavel: "INT-10", Nome: "Caneca", CorWebPrincipal: "PRETO", QuantidadeDisponivel: 0 },
      { IdProduto: 4, CodigoXbz: "SEM", CodigoAmigavel: "INT-20", Nome: "Copo", QuantidadeDisponivel: 0 },
    ]);

    expect(groupAvailableProducts(products)).toEqual([
      expect.objectContaining({
        id: "INT-10",
        internalCode: "INT-10",
        totalStock: 8,
        colors: ["AZUL", "VERMELHO"],
        variants: [expect.objectContaining({ sku: "SKU-AZ" }), expect.objectContaining({ sku: "SKU-VM" })],
      }),
    ]);
  });
});
