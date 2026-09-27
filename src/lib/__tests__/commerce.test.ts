import { describe, expect, it } from "vitest";
import {
  buildQuoteMessage,
  buildWhatsAppUrl,
  calculateLineTotal,
  type QuoteCartItem,
} from "../commerce";

const cartItem: QuoteCartItem = {
  id: "item-1",
  productName: "Caneca personalizada",
  slug: "caneca-personalizada",
  quantity: 10,
  selections: {
    Material: "Cerâmica branca",
    Capacidade: "325 ml",
    Acabamento: "Brilho",
  },
  artworkName: "logo-cliente.pdf",
  unitPrice: null,
};

describe("calculateLineTotal", () => {
  it("keeps quote-only products without a fabricated price", () => {
    expect(calculateLineTotal(null, [10, 5], 20)).toBeNull();
  });

  it("adds selected modifiers before multiplying the quantity", () => {
    expect(calculateLineTotal(2.5, [0.5, 1], 10)).toBe(40);
  });
});

describe("buildQuoteMessage", () => {
  it("formats customer, configuration and artwork for WhatsApp", () => {
    const message = buildQuoteMessage(
      { name: "Nicolas", company: "Fare Foto", phone: "11999999999", notes: "Preciso para sexta." },
      [cartItem],
    );

    expect(message).toContain("Pedido de orçamento — Fare Foto");
    expect(message).toContain("Nicolas");
    expect(message).toContain("Caneca personalizada");
    expect(message).toContain("Material: Cerâmica branca");
    expect(message).toContain("Arte: logo-cliente.pdf");
    expect(message).toContain("Valor: sob consulta");
    expect(message).toContain("Preciso para sexta.");
  });
});

describe("buildWhatsAppUrl", () => {
  it("targets the given number and safely encodes the message", () => {
    const url = buildWhatsAppUrl("5511977843872", "Olá! Quero orçamento.");

    expect(url).toBe("https://wa.me/5511977843872?text=Ol%C3%A1!%20Quero%20or%C3%A7amento.");
  });
});
