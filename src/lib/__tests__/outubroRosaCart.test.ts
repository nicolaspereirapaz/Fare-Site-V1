// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { appendCampaignCartItem, OUTUBRO_ROSA_CART_KEY, readCampaignCart } from "../outubroRosaCart";

describe("carrinho da campanha Outubro Rosa", () => {
  beforeEach(() => window.localStorage.clear());

  it("acrescenta itens da página do produto sem perder os anteriores", () => {
    appendCampaignCartItem({ productName: "Caneta Plástica", slug: "a", quantity: 100, selections: { Cor: "Azul" }, artworkName: null, unitPrice: null, image: "" });
    const cart = appendCampaignCartItem({ productName: "Copo Térmico", slug: "b", quantity: 50, selections: { Cor: "Rosa" }, artworkName: "logo.pdf", unitPrice: null, image: "" });
    expect(cart).toHaveLength(2);
    expect(readCampaignCart().map((item) => item.productName)).toEqual(["Caneta Plástica", "Copo Térmico"]);
    expect(new Set(cart.map((item) => item.id)).size).toBe(2);
  });

  it("ignora conteúdo corrompido no armazenamento", () => {
    window.localStorage.setItem(OUTUBRO_ROSA_CART_KEY, "{quebrado");
    expect(readCampaignCart()).toEqual([]);
    window.localStorage.setItem(OUTUBRO_ROSA_CART_KEY, JSON.stringify({ not: "array" }));
    expect(readCampaignCart()).toEqual([]);
  });
});
