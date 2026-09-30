import { describe, expect, it, vi } from "vitest";
import { createCheckoutHandler } from "@/lib/checkout";

const body = {
  customer: { name: "Ana", phone: "11999999999" },
  paymentMethod: "pix",
  idempotencyKey: "checkout-abc-123",
  userId: "usuario-forjado",
  items: [{
    id: "item-1",
    productName: "Foto 10x15",
    slug: "foto-10x15",
    quantity: 1,
    selections: {},
    unitPrice: 2,
  }],
};

function request() {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "better-auth.session_token=qualquer" },
    body: JSON.stringify(body),
  });
}

function requestWithBody(value: unknown) {
  return new Request("http://localhost/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("checkout protegido", () => {
  it("nega a finalização quando a sessão não é confirmada pelo servidor", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const response = await createCheckoutHandler(getSession, vi.fn())(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession.mock.calls[0][0].headers.get("cookie")).toContain("better-auth.session_token");
  });

  it("persiste o pedido com o usuário da sessão e libera a URL de finalização", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn().mockReturnValue({
      id: "order-1",
      status: "aguardando_pagamento",
      paymentMethod: "pix",
      customer: body.customer,
      items: body.items,
    });
    const response = await createCheckoutHandler(getSession, persistOrder)(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.url).toMatch(/^https:\/\/wa\.me\//);
    expect(payload.orderId).toBe("order-1");
    expect(payload.status).toBe("aguardando_pagamento");
    expect(persistOrder).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      idempotencyKey: "checkout-abc-123",
      paymentMethod: "pix",
    }));
    expect(persistOrder).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "usuario-forjado" }));
  });

  it("monta o WhatsApp com o snapshot persistido ao repetir uma chave", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn().mockReturnValue({
      id: "order-original",
      status: "aguardando_pagamento",
      paymentMethod: "boleto",
      customer: { name: "Cliente original", phone: "11888888888" },
      items: [{ ...body.items[0], productName: "Produto original" }],
    });

    const response = await createCheckoutHandler(getSession, persistOrder)(request());
    const payload = await response.json();
    const message = new URL(payload.url).searchParams.get("text");

    expect(message).toContain("Cliente original");
    expect(message).toContain("Produto original");
    expect(message).toContain("Pagamento informado: Boleto");
    expect(message).not.toContain("Ana");
  });

  it("responde erro controlado quando a persistência falha", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn(() => { throw new Error("sqlite indisponível"); });

    const response = await createCheckoutHandler(getSession, persistOrder)(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "ORDER_CREATION_FAILED" });
  });

  it.each([
    ["pagamento não permitido", { ...body, paymentMethod: "dinheiro" }],
    ["chave de idempotência ausente", { ...body, idempotencyKey: "" }],
    ["quantidade inválida", { ...body, items: [{ ...body.items[0], quantity: 0 }] }],
    ["preço negativo", { ...body, items: [{ ...body.items[0], unitPrice: -1 }] }],
    ["preço fora do limite", { ...body, items: [{ ...body.items[0], unitPrice: Number.MAX_VALUE }] }],
    ["item incompleto", { ...body, items: [{ id: "item-1" }] }],
    ["cliente sem telefone", { ...body, customer: { name: "Ana" } }],
  ])("rejeita %s", async (_label, invalidBody) => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn();

    const response = await createCheckoutHandler(getSession, persistOrder)(requestWithBody(invalidBody));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_REQUEST" });
    expect(persistOrder).not.toHaveBeenCalled();
  });
});
