import { describe, expect, it } from "vitest";
import { repriceCartItems } from "@/lib/orders/serverPricing";
import type { QuoteCartItem } from "@/lib/commerce";

// Caneta: custo R$ 0,82 → venda 164 centavos/un. + R$ 100 de frete rateado.
const CANETA = { unitSaleCents: 164, freightCents: 10000 };
const lookup = (publicId: string) => (publicId === "cf93a396fd138947" ? CANETA : null);

const gift = (overrides: Partial<QuoteCartItem> = {}): QuoteCartItem => ({
  id: "linha-1",
  productName: "Caneta Plástica",
  slug: "brindes/cf93a396fd138947",
  quantity: 100,
  selections: { "Variação": "Azul" },
  artworkName: null,
  unitPrice: 2.64,
  pricing: CANETA,
  ...overrides,
});

describe("preço calculado no servidor", () => {
  it("recalcula o brinde pelo catálogo, ignorando o valor que veio do navegador", () => {
    const [item] = repriceCartItems([gift({ unitPrice: 0.01, pricing: { unitSaleCents: 1, freightCents: 0 } })], lookup);
    expect(item.unitPrice).toBe(2.64);
    expect(item.pricing).toEqual(CANETA);
  });

  it("descarta custo e mockup vindos do navegador", () => {
    const [item] = repriceCartItems([gift({ mockup: "00000000-0000-0000-0000-000000000000.jpg", costing: { custoProduto: 0 } as never })], lookup);
    expect(item).not.toHaveProperty("mockup");
    expect(item).not.toHaveProperty("costing");
  });

  it("usa a quantidade do pedido (300 un. = 592 ÷ 300 = R$ 1,98, para cima)", () => {
    expect(repriceCartItems([gift({ quantity: 300 })], lookup)[0].unitPrice).toBe(1.98);
  });

  it("brinde fora do catálogo ou sem preço vira 'sob consulta'", () => {
    const [item] = repriceCartItems([gift({ slug: "brindes/naoexiste", unitPrice: 5 })], lookup);
    expect(item.unitPrice).toBeNull();
    expect(item.pricing).toBeNull();
  });

  it("produtos da loja (fotos, quadros…) não têm preço no site: ficam 'sob consulta'", () => {
    const [item] = repriceCartItems([gift({ slug: "quadro-personalizado", unitPrice: 0.5, pricing: null })], lookup);
    expect(item.unitPrice).toBeNull();
  });

  it("mantém os demais campos do item", () => {
    const [item] = repriceCartItems([gift()], lookup);
    expect(item).toMatchObject({ id: "linha-1", productName: "Caneta Plástica", quantity: 100, selections: { "Variação": "Azul" } });
  });
});

describe("códigos gravados no item do pedido", () => {
  it("cada brinde guarda o código Fare Foto, o código real do fornecedor e o SKU da cor escolhida", async () => {
    const { attachItemCodes } = await import("@/lib/orders/serverPricing");
    const codes = { fare: "X10001", supplier: "xbz" as const, supplierCode: "06520", sku: "06520-AZU" };
    const [item, other] = attachItemCodes(
      [gift({ codes: { fare: "FALSO", supplier: "asia", supplierCode: "x", sku: "x" } }), gift({ slug: "produtos/foto" })],
      (publicId, label) => (publicId === "cf93a396fd138947" && label === "Azul" ? codes : null),
    );
    expect(item.codes).toEqual(codes); // o que vem do navegador é descartado
    expect(other.codes).toBeUndefined();
  });
});

describe("composição de custo vinda do navegador", () => {
  it("é descartada (só a equipe grava, pelo painel)", () => {
    const [item] = repriceCartItems([{
      id: "1", productName: "Caneta", slug: "outro/x", quantity: 10, selections: {}, unitPrice: 1,
      costing: { custoProduto: 0, personalizacao: "x", detalhe: "", personalizacaoUnitaria: 0, custoPersonalizacaoTotal: 0, freteFornecedor: 0, tecnica: { tipo: "manual" }, por: "", em: "" },
    }], () => null);
    expect(item).not.toHaveProperty("costing");
  });
});
