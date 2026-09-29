// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendCampaignCartItem, cartItemSubtotal, cartItemUnitPrice, OUTUBRO_ROSA_CART_KEY, readCampaignCart, summarizeCart,
  type NewCampaignCartItem,
} from "../outubroRosaCart";

const pricing = { unitSaleCents: 184, freightCents: 10000 };
const item = (overrides: Partial<NewCampaignCartItem> = {}): NewCampaignCartItem => ({
  productName: "Caneta Plástica", slug: "a", quantity: 100, selections: { Cor: "Rosa" }, color: "Rosa",
  artworkName: null, unitPrice: null, image: "", pricing, ...overrides,
});

describe("carrinho da campanha Outubro Rosa", () => {
  beforeEach(() => window.localStorage.clear());

  it("acrescenta itens diferentes sem perder os anteriores", () => {
    appendCampaignCartItem(item());
    const cart = appendCampaignCartItem(item({ productName: "Copo Térmico", slug: "b", quantity: 50 }));
    expect(cart).toHaveLength(2);
    expect(readCampaignCart().map((entry) => entry.productName)).toEqual(["Caneta Plástica", "Copo Térmico"]);
    expect(new Set(cart.map((entry) => entry.id)).size).toBe(2);
  });

  it("soma a quantidade quando o mesmo produto e cor é adicionado de novo", () => {
    appendCampaignCartItem(item({ quantity: 100 }));
    const cart = appendCampaignCartItem(item({ quantity: 150 }));
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(250);
    expect(appendCampaignCartItem(item({ color: "Branco", selections: { Cor: "Branco" } }))).toHaveLength(2);
  });

  it("recalcula o valor pela quantidade atual (frete rateado)", () => {
    expect(cartItemUnitPrice({ ...item(), id: "x", quantity: 100 })).toBe(2.84);
    expect(cartItemUnitPrice({ ...item(), id: "x", quantity: 250 })).toBe(2.24);
    expect(cartItemSubtotal({ ...item(), id: "x", quantity: 250 })).toBe(560);
    expect(cartItemUnitPrice({ ...item({ pricing: null }), id: "x" })).toBeNull();
  });

  it("resume linhas, unidades e total estimado", () => {
    const summary = summarizeCart([
      { ...item({ quantity: 250 }), id: "1" },
      { ...item({ quantity: 20, pricing: null }), id: "2" },
    ]);
    expect(summary).toEqual({ lines: 2, units: 270, total: 560, hasUnpriced: true });
  });

  it("ignora conteúdo corrompido no armazenamento", () => {
    window.localStorage.setItem(OUTUBRO_ROSA_CART_KEY, "{quebrado");
    expect(readCampaignCart()).toEqual([]);
    window.localStorage.setItem(OUTUBRO_ROSA_CART_KEY, JSON.stringify({ not: "array" }));
    expect(readCampaignCart()).toEqual([]);
    window.localStorage.setItem(OUTUBRO_ROSA_CART_KEY, JSON.stringify([{ id: "1", productName: "X", quantity: 0 }, null]));
    expect(readCampaignCart()).toEqual([]);
  });
});