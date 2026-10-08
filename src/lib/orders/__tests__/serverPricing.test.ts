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

  it("usa a quantidade do pedido (faixa de 300 un. = R$ 1,97)", () => {
    expect(repriceCartItems([gift({ quantity: 300 })], lookup)[0].unitPrice).toBe(1.97);
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
