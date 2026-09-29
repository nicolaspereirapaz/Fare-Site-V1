import { describe, expect, it } from "vitest";
import { formatProductName, groupAvailableProducts, inferCategory, normalizeProduct, normalizeProducts } from "../xbz";

describe("apresentação dos produtos", () => {
  it("exibe nomes em título com conectores minúsculos", () => {
    expect(formatProductName("COPO TÉRMICO 500ML")).toBe("Copo Térmico 500ml");
    expect(formatProductName("CADERNETA EMBORRACHADA COM PAUTA")).toBe("Caderneta Emborrachada com Pauta");
    expect(formatProductName("LUMINÁRIA DE MESA RECARREGÁVEL")).toBe("Luminária de Mesa Recarregável");
    expect(formatProductName("GARRAFA TÉRMICA INOX 500ML C/ CAPA")).toBe("Garrafa Térmica Inox 500ml c/ Capa");
    expect(formatProductName("mochila executiva")).toBe("Mochila Executiva");
  });

  it("preserva siglas, litros e capacidades", () => {
    expect(formatProductName("SACOLA TNT BIODEGRADÁVEL")).toBe("Sacola TNT Biodegradável");
    expect(formatProductName("MOCHILA PU 24,5L")).toBe("Mochila PU 24,5L");
    expect(formatProductName("PEN DRIVE 16GB")).toBe("Pen Drive 16GB");
    expect(formatProductName("POWER BANK 10.000MAH")).toBe("Power Bank 10.000mAh");
    expect(formatProductName("PORTA-GARRAFA OXFORD")).toBe("Porta-Garrafa Oxford");
    expect(formatProductName("BLOCO C/ AUTOADESIVO \"SEM CANETA\"")).toBe("Bloco c/ Autoadesivo \"Sem Caneta\"");
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

  it("ignora marcações comerciais no lugar da categoria", () => {
    expect(inferCategory("CANECA TÉRMICA 450ML", "PONTA DE ESTOQUE")).toBe("Canecas, Copos e Taças");
  });

  it("classifica pelo tipo do produto, não por qualquer palavra do nome", () => {
    expect(inferCategory("CANECA ACRÍLICA 400 ML", "")).toBe("Canecas, Copos e Taças");
    expect(inferCategory("MOCHILA PARA NOTEBOOK", "")).toBe("Mochilas");
    expect(inferCategory("SACOLA DE ALGODÃO", "")).toBe("Bolsas e Sacolas");
    expect(inferCategory("GARRAFA TÉRMICA 500ML", "")).toBe("Garrafas e Squeezes");
    expect(inferCategory("CADERNO PLÁSTICO C/ CANETA", "")).toBe("Cadernos e Agendas");
    expect(inferCategory("ESTOJO P/ 2 CANETAS", "")).toBe("Necessaires e Estojos");
  });

  it("separa bolsas térmicas, kits temáticos e combinações ambíguas", () => {
    expect(inferCategory("BOLSA TÉRMICA 10L", "")).toBe("Bolsas Térmicas e Marmitas");
    expect(inferCategory("MOCHILA TERMICA 10L", "")).toBe("Bolsas Térmicas e Marmitas");
    expect(inferCategory("KIT CHURRASCO 4 PEÇAS INOX C/ ESTOJO", "")).toBe("Churrasco, Vinho e Queijo");
    expect(inferCategory("KIT MANICURE 16 PEÇAS", "")).toBe("Beleza e Bem-estar");
    expect(inferCategory("CHAVEIRO KIT MANICURE 4 PÇS", "")).toBe("Beleza e Bem-estar");
    expect(inferCategory("FRISBEE PARA PET", "")).toBe("Pet");
    expect(inferCategory("KIT RAQUETES PICKLEBALL 3 PEÇAS", "")).toBe("Esporte e Fitness");
    expect(inferCategory("MINI VENTILADOR RECARREGÁVEL", "")).toBe("Tecnologia");
    expect(inferCategory("CAIXA PARA PRESENTE", "")).toBe("Embalagens para Presente");
  });

  it("usa a descrição quando o nome não basta", () => {
    expect(inferCategory("PRODUTO MULTIUSO", "", "Ideal para seu pet passear com conforto.")).toBe("Pet");
    expect(inferCategory("ACESSÓRIO SORTIDO", "")).toBe("Outros");
  });

  it("reclassifica categorias antigas do banco local e remove itens internos", () => {
    const [product] = groupAvailableProducts([
      { ...normalizeProduct({ IdProduto: 1, CodigoAmigavel: "F1", Nome: "BOLSA TÉRMICA 5L", QuantidadeDisponivel: 3 }), category: "Bolsas e mochilas" },
      normalizeProduct({ IdProduto: 2, CodigoAmigavel: "F2", Nome: "CATÁLOGO 2026 XBZ BRINDES", QuantidadeDisponivel: 50 }),
    ]);
    expect(product.category).toBe("Bolsas Térmicas e Marmitas");
    expect(groupAvailableProducts([
      normalizeProduct({ IdProduto: 3, CodigoAmigavel: "F3", Nome: "PRODUTO TESTE ****@", QuantidadeDisponivel: 9 }),
    ])).toHaveLength(0);
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
