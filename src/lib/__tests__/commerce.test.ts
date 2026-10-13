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

  it("separa cliente, faturamento e itens por linhas em branco", () => {
    const message = buildQuoteMessage(
      {
        name: "Ana", phone: "(11) 98888-7777",
        billing: {
          personType: "pf", document: "529.982.247-25", companyName: "", tradeName: "", stateRegistration: "",
          address: { cep: "13201-000", street: "Rua A", number: "1", complement: "", district: "Centro", city: "Jundiaí", state: "SP" },
        },
      },
      [cartItem],
    );

    expect(message).toContain("Pedido de orçamento — Fare Foto\n\nCliente: Ana\nTelefone: (11) 98888-7777\n\nFaturar para:\nCPF: 529.982.247-25\nEndereço: Rua A, 1 — Centro, Jundiaí/SP — CEP 13201-000\n\n1. Caneca personalizada");
    expect(message).not.toContain("Razão social");
  });
});

describe("buildWhatsAppUrl", () => {
  it("targets the given number and safely encodes the message", () => {
    const url = buildWhatsAppUrl("5511953147703", "Olá! Quero orçamento.");

    expect(url).toBe("https://wa.me/5511953147703?text=Ol%C3%A1!%20Quero%20or%C3%A7amento.");
  });
});

describe("código do brinde na mensagem do WhatsApp", () => {
  it("leva só o código Fare Foto, nunca o código do fornecedor nem o SKU", async () => {
    const { buildQuoteMessage } = await import("@/lib/commerce");
    const message = buildQuoteMessage({ name: "Ana" }, [{
      id: "1", productName: "Caneca", slug: "brindes/abc", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2,
      codes: { fare: "X10001", supplier: "xbz", supplierCode: "06520", sku: "06520-AZU" },
    }]);
    expect(message).toContain("Código: X10001");
    expect(message).not.toContain("06520");
    expect(message).not.toMatch(/xbz/i);
  });
});
