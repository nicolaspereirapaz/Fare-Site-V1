import { describe, expect, it } from "vitest";
import { normalizeSpotCatalog, spotDisplayName, SPOT_IMAGE_BASE } from "@/lib/suppliers/spot";
import { normalizeAsiaProducts } from "@/lib/suppliers/asiaImport";
import { groupAvailableProducts } from "@/lib/xbz";

const SPOT_PRODUCTS = [
  {
    ProdReference: "92802",
    Name: "TISANA. Copo para viagem em fibra de bambu (60%) e PP (40%) (450 mL)",
    ShortDescription: "<p>Copo de viagem em fibra de bambu &amp; PP com tampa.</p>",
    Description: "Descrição longa",
    MainImage: "92802_set.jpg",
    Type: "Squeezes & Copos",
    SubType: "Canecas de Viagem",
    IsStockOut: "False",
  },
  { ProdReference: "11103", Name: "11103. Borracha branca em TPR", ShortDescription: "Borracha", MainImage: "11103_103.jpg", IsStockOut: "True" },
];

const SPOT_OPTIONALS = [
  { Sku: "92802-105", ProdReference: "92802", ColorDesc1: "Azul royal", ColorDesc2: "", OptionalImage1: "92802_105.jpg", YourPrice: 7.35 },
  { Sku: "92802-103", ProdReference: "92802", ColorDesc1: "Preto", ColorDesc2: "Natural", OptionalImage1: "", YourPrice: "7.10" },
  { Sku: "11103-103", ProdReference: "11103", ColorDesc1: "Preto", OptionalImage1: "11103_103.jpg", YourPrice: 0.342 },
  { Sku: "99999-1", ProdReference: "99999", ColorDesc1: "Preto", OptionalImage1: "x.jpg", YourPrice: 1 },
];

const SPOT_STOCKS = [
  { Sku: "92802-105", Quantity: 1200 },
  { Sku: "92802-103", Quantity: 0 },
  { Sku: "11103-103", Quantity: 229763 },
];

describe("Spot", () => {
  it("tira o código/linha do começo do nome", () => {
    expect(spotDisplayName("TISANA. Copo para viagem (450 mL)")).toBe("Copo para viagem (450 mL)");
    expect(spotDisplayName("11110. Caneta esferográfica com mecanismo twist")).toBe("Caneta esferográfica com mecanismo twist");
    expect(spotDisplayName("Caneta sem prefixo. Com ponto")).toBe("Caneta sem prefixo. Com ponto");
  });

  it("cada cor (SKU) vira uma variação, com foto, preço de custo e estoque", () => {
    const products = normalizeSpotCatalog(SPOT_PRODUCTS, SPOT_OPTIONALS, SPOT_STOCKS);
    const azul = products.find((product) => product.sku === "92802-105");

    expect(products).toHaveLength(3); // 99999 não existe no catálogo de produtos
    expect(azul).toMatchObject({
      id: "spot:92802-105",
      familyCode: "spot:92802",
      supplier: "spot",
      name: "Copo para viagem em fibra de bambu (60%) e PP (40%) (450 mL)",
      description: "Copo de viagem em fibra de bambu & PP com tampa.",
      imageUrl: `${SPOT_IMAGE_BASE}92802_105.jpg`,
      primaryColor: "Azul royal",
      price: 7.35,
      stockAvailable: 1200,
      category: "Canecas, Copos e Taças",
    });
    // sem foto da cor, usa a foto principal; preço em texto também é aceito
    expect(products.find((product) => product.sku === "92802-103")).toMatchObject({
      imageUrl: `${SPOT_IMAGE_BASE}92802_set.jpg`, price: 7.1, secondaryColor: "Natural", stockAvailable: 0,
    });
    expect(products.find((product) => product.sku === "11103-103")?.clearance).toBe(true);
  });
});

const ASIA_PRODUCTS = [
  {
    referencia: "BT316",
    nome: "Bolsa Térmica",
    descricao: "Bolsa térmica (cooler) com alça &amp; revestimento.",
    preco: "29.9",
    imagem: "https://media.asiaimport.com.br/2025/12/Perfil-18.jpg",
    status: true,
    categorias: { 119: "Bolsas Térmicas" },
    variacoes: [
      { referencia: "BT316-AZ", nome: "Bolsa Térmica", preco: "29.9", qtd_estoque: 1975, imagem: "https://media.asiaimport.com.br/2025/12/BT316-AZ.jpg", atributos: { cor: { name: "azul-claro" } }, status: true },
      { referencia: "BT316-PT", nome: "Bolsa Térmica", preco: "", qtd_estoque: 10, imagem: "", atributos: { cor: { name: "cafe-2" } }, status: true },
      { referencia: "BT316-VM", nome: "Bolsa Térmica", preco: "29.9", qtd_estoque: 50, imagem: "", atributos: { cor: { name: "vermelho" } }, status: false },
    ],
  },
  { referencia: "OM2996P", nome: "996 - HIGIENIZADOR A/C", descricao: "", preco: "304.78", imagem: "", status: false, variacoes: [{ referencia: "OM2996", qtd_estoque: 5 }] },
];

describe("Asia Import", () => {
  it("cada variação ativa vira um item, com cor legível e foto da variação (ou a principal)", () => {
    const products = normalizeAsiaProducts(ASIA_PRODUCTS);

    expect(products.map((product) => product.sku)).toEqual(["BT316-AZ", "BT316-PT"]);
    expect(products[0]).toMatchObject({
      id: "asia:BT316-AZ",
      familyCode: "asia:BT316",
      supplier: "asia",
      name: "Bolsa Térmica",
      description: "Bolsa térmica (cooler) com alça & revestimento.",
      imageUrl: "https://media.asiaimport.com.br/2025/12/BT316-AZ.jpg",
      primaryColor: "Azul Claro",
      price: 29.9,
      stockAvailable: 1975,
      category: "Bolsas Térmicas e Marmitas",
    });
    expect(products[1]).toMatchObject({
      primaryColor: "Café", imageUrl: "https://media.asiaimport.com.br/2025/12/Perfil-18.jpg", price: 29.9,
    });
  });
});

describe("catálogo unificado", () => {
  it("produtos de fornecedores diferentes com o mesmo código não se misturam", () => {
    const spot = normalizeSpotCatalog(SPOT_PRODUCTS, SPOT_OPTIONALS, SPOT_STOCKS);
    const asia = normalizeAsiaProducts(ASIA_PRODUCTS);
    const grouped = groupAvailableProducts([...spot, ...asia]);

    expect(grouped.map((product) => product.internalCode).sort()).toEqual(["asia:BT316", "spot:11103", "spot:92802"]);
    expect(grouped.find((product) => product.internalCode === "asia:BT316")?.variants).toHaveLength(2);
    // variação sem estoque fica de fora
    expect(grouped.find((product) => product.internalCode === "spot:92802")?.variants).toHaveLength(1);
  });
});

describe("categorias da loja nos fornecedores novos", () => {
  it("usa sempre as regras da loja; a categoria do fornecedor só desempata o que iria para 'Outros'", async () => {
    const { categoryWithHints } = await import("@/lib/suppliers/shared");
    const { PRODUCT_CATEGORIES } = await import("@/lib/productCategories");

    expect(categoryWithHints("Garrafa térmica 500 mL", "", ["Mochilas"])).toBe("Garrafas e Squeezes");
    expect(categoryWithHints("Guarda-sol em poliéster 300D", "", ["Guarda-Sol", "Sol & Chuva"])).toBe("Viagem e Lazer");
    expect(categoryWithHints("Espremedor de frutas", "", ["Utilitários de Cozinha", "Casa, Restaurante & Bar"])).toBe("Casa e Cozinha");
    expect(categoryWithHints("Porta Notebook", "", ["Mochilas & Malas", "P/ Notebooks"])).toBe("Mochilas");
    expect(categoryWithHints("Objeto misterioso", "", [])).toBe("Outros");
    for (const hint of ["Barbecue", "Sacos de Compras", "Lanternas", "T-Shirts", "Bolas", "Embalagens"]) {
      expect(PRODUCT_CATEGORIES).toContain(categoryWithHints("Objeto", "", [hint]));
    }
  });
});

describe("Asia: linha de total do produto", () => {
  it("variação com o mesmo código do produto (estoque = soma das cores, preço 0) não é uma cor", async () => {
    const { normalizeAsiaProducts } = await import("../asiaImport");
    const cor = (referencia: string, nome: string, qtd: number, preco: string | number = "42.9") => ({
      referencia, preco, qtd_estoque: qtd, imagem: `https://cdn/${referencia}.jpg`, status: true, atributos: { cor: { name: nome } },
    });
    const products = normalizeAsiaProducts([{
      referencia: "GA9130", nome: "Garrafa Térmica", preco: 42.9, status: true, imagem: "https://cdn/ga.jpg",
      variacoes: [cor("GA9130-AZ", "azul", 1049), cor("GA9130", "cinza", 2099, 0), cor("GA9130-CZ", "cinza", 1050)],
    }]);
    expect(products.map((product) => product.sku)).toEqual(["GA9130-AZ", "GA9130-CZ"]);
  });

  it("produto de cor única (a única variação tem o código do produto) continua", async () => {
    const { normalizeAsiaProducts } = await import("../asiaImport");
    const products = normalizeAsiaProducts([{
      referencia: "BT316", nome: "Bolsa", preco: 10, status: true, imagem: "https://cdn/bt.jpg",
      variacoes: [{ referencia: "BT316", preco: "10", qtd_estoque: 50, imagem: "https://cdn/bt.jpg", status: true }],
    }]);
    expect(products.map((product) => product.sku)).toEqual(["BT316"]);
  });
});
