import { describe, expect, it } from "vitest";
import { createCheckoutHandler } from "@/lib/checkout";

describe("mensagem do WhatsApp usa o número curto do pedido", () => {
  it("cita #FF-XXXXXX em vez do código interno", async () => {
    const handler = createCheckoutHandler(
      async () => ({ user: { id: "u1" } }),
      (input) => ({
        id: "3f7a2c9e-a9cb-44f6-8f99-1e6e13241ebf",
        status: "aguardando_pagamento",
        paymentMethod: input.paymentMethod,
        customer: input.customer,
        items: input.items,
      }),
    );
    const response = await handler(new Request("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        customer: { name: "Ana", phone: "11999999999" },
        items: [{ id: "i1", productName: "Caneta", slug: "brindes/x", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.64 }],
        paymentMethod: "pix",
        idempotencyKey: "chave-teste-123",
      }),
    }));
    const { url } = await response.json();
    const text = new URL(url).searchParams.get("text")!;
    expect(text).toContain("Pedido #PED-3F7A2C");
    expect(text).toContain("Pagamento informado: Pix");
    expect(text).not.toContain("3f7a2c9e-a9cb");
  });
});
