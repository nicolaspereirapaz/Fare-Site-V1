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
      { ...normalizeProduct({ IdProduto: 1, CodigoAmigavel: "F1", Nome: "BOLSA TÉRMICA 5L", QuantidadeDisponivel: 3, PrecoVenda: 5, ImageLink: "https://cdn/1.jpg" }), category: "Bolsas e mochilas" },
      normalizeProduct({ IdProduto: 2, CodigoAmigavel: "F2", Nome: "CATÁLOGO 2026 XBZ BRINDES", QuantidadeDisponivel: 50, PrecoVenda: 5, ImageLink: "https://cdn/2.jpg" }),
    ]);
    expect(product.category).toBe("Bolsas Térmicas e Marmitas");
    expect(groupAvailableProducts([
      normalizeProduct({ IdProduto: 3, CodigoAmigavel: "F3", Nome: "PRODUTO TESTE ****@", QuantidadeDisponivel: 9, PrecoVenda: 5, ImageLink: "https://cdn/3.jpg" }),
    ])).toHaveLength(0);
  });
});

describe("agrupamento das variações", () => {
  it("agrupa cores pelo código interno e remove variações sem estoque", () => {
    const products = normalizeProducts([
      { IdProduto: 1, CodigoXbz: "SKU-AZ", CodigoAmigavel: "INT-10", Nome: "Caneca", CorWebPrincipal: "AZUL", QuantidadeDisponivel: 5, PrecoVenda: 5, ImageLink: "https://cdn/az.jpg" },
      { IdProduto: 2, CodigoXbz: "SKU-VM", CodigoAmigavel: "INT-10", Nome: "Caneca", CorWebPrincipal: "VERMELHO", QuantidadeDisponivel: 3, PrecoVenda: 5 },
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

describe("fotos dos produtos no catálogo", () => {
  const base = {
    sku: "", compoundCode: "", name: "BOLSA EVA", description: "", productUrl: "", category: "Bolsas e Sacolas", subcategory: "",
    secondaryColor: "", price: 5, formattedPrice: "", clearance: false, stockMain: 10, stockAvailable: 10, reliability: "", restockDate: "",
  };

  it("a foto principal é a da 1ª cor que tem foto (não a da 1ª cor da lista)", () => {
    const [product] = groupAvailableProducts([
      { ...base, id: "1", familyCode: "09318", primaryColor: "ROSA", imageUrl: "" },
      { ...base, id: "2", familyCode: "09318", primaryColor: "AZUL", imageUrl: "https://cdn/azul.jpg" },
    ]);
    expect(product.imageUrl).toBe("https://cdn/azul.jpg");
    expect(product.variants).toHaveLength(2);
  });

  it("ponta de estoque (P@/E@) sem foto usa a foto do mesmo produto do catálogo normal", () => {
    const [product] = groupAvailableProducts([
      { ...base, id: "1", familyCode: "P@02306-6", primaryColor: "COLORIDO", imageUrl: "" },
      { ...base, id: "2", familyCode: "02306-6", primaryColor: "COLORIDO", imageUrl: "https://cdn/kit.jpg", stockAvailable: 0 },
    ]);
    expect(product.internalCode).toBe("P@02306-6");
    expect(product.imageUrl).toBe("https://cdn/kit.jpg");
  });

  it("produto sem nenhuma foto não aparece na loja (volta sozinho quando o fornecedor publicar)", () => {
    const products = groupAvailableProducts([
      { ...base, id: "1", familyCode: "01500", primaryColor: "PRETO", imageUrl: "" },
      { ...base, id: "2", familyCode: "09319", primaryColor: "AZUL", imageUrl: "https://cdn/caneta.jpg" },
    ]);
    expect(products.map((product) => product.internalCode)).toEqual(["09319"]);
  });
});

describe("links de foto com erro de digitação no fornecedor", () => {
  it("corrige os erros óbvios e descarta o que não é link", async () => {
    const { repairImageUrl } = await import("../xbz");
    const url = "https://cdn.xbzbrindes.com.br/img/produtos/3/Guarda-Chuva-AZUL.jpg";
    expect(repairImageUrl(`h${url}`)).toBe(url);
    expect(repairImageUrl(`${url}${url}`)).toBe(url);
    expect(repairImageUrl("https://.xbzbrindes.com.br/img/produtos/3/Caneta.jpg")).toBe("https://cdn.xbzbrindes.com.br/img/produtos/3/Caneta.jpg");
    expect(repairImageUrl(` ${url} `)).toBe(url);
    expect(repairImageUrl("Kit Prendedores Plásticos 10 Peças")).toBe("");
    expect(repairImageUrl("")).toBe("");
    expect(repairImageUrl(url)).toBe(url);
  });
});

describe("produtos sem preço do fornecedor", () => {
  const base = {
    sku: "", compoundCode: "", name: "GARRAFA TÉRMICA", description: "", productUrl: "", category: "Garrafas e Squeezes", subcategory: "",
    secondaryColor: "", formattedPrice: "", clearance: false, stockMain: 10, stockAvailable: 10, reliability: "", restockDate: "", imageUrl: "https://cdn/g.jpg",
  };

  it("cor sem preço (zero ou vazio) sai; o preço 'a partir de' é o da cor mais barata com preço", () => {
    const [product] = groupAvailableProducts([
      { ...base, id: "1", familyCode: "GA9130", primaryColor: "AZUL", price: 42.9 },
      { ...base, id: "2", familyCode: "GA9130", primaryColor: "PRETO", price: 0 },
      { ...base, id: "3", familyCode: "GA9130", primaryColor: "BRANCO", price: null },
    ]);
    expect(product.price).toBe(42.9);
    expect(product.variants.map((variant) => variant.primaryColor)).toEqual(["AZUL"]);
    expect(product.colors).toEqual(["AZUL"]);
  });

  it("produto sem nenhuma cor com preço não aparece na loja", () => {
    const products = groupAvailableProducts([
      { ...base, id: "1", familyCode: "19219", primaryColor: "CRU", price: 0 },
      { ...base, id: "2", familyCode: "19219", primaryColor: "PRETO", price: null },
      { ...base, id: "3", familyCode: "09319", primaryColor: "AZUL", price: 3 },
    ]);
    expect(products.map((product) => product.internalCode)).toEqual(["09319"]);
  });
});
