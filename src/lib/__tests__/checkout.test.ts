import { describe, expect, it, vi } from "vitest";
import { createCheckoutHandler } from "@/lib/checkout";
import type { CreateOrderInput } from "@/lib/orders/repository";

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
  const BILLING = {
    personType: "pj" as const,
    document: "11.222.333/0001-81",
    companyName: "Padaria Boa Vista Ltda",
    tradeName: "Padaria Boa Vista",
    stateRegistration: "407.123.456.789",
    address: {
      cep: "13201-000", street: "Rua Barão de Jundiaí", number: "100", complement: "Sala 2",
      district: "Centro", city: "Jundiaí", state: "SP",
    },
  };

  it("anexa ao pedido os dados de faturamento da conta (lidos no servidor) e os coloca na mensagem", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn((input: CreateOrderInput) => ({ id: "order-1", status: "aguardando_pagamento" as const, paymentMethod: input.paymentMethod, customer: input.customer, items: input.items }));
    const readBilling = vi.fn().mockReturnValue(BILLING);
    const forged = { ...body, customer: { ...body.customer, billing: { ...BILLING, document: "99.999.999/9999-99" }, extra: "x" } };

    const response = await createCheckoutHandler(getSession, persistOrder, { readBilling })(requestWithBody(forged));
    expect(response.status).toBe(200);
    expect(readBilling).toHaveBeenCalledWith("user-1");
    // o que vem do navegador é ignorado: vale o cadastro salvo na conta
    expect(persistOrder.mock.calls[0][0].customer).toEqual({ name: "Ana", phone: "11999999999", billing: BILLING });

    const message = decodeURIComponent((await response.json()).url.split("text=")[1]);
    expect(message).toContain("Faturar para:");
    expect(message).toContain("CNPJ: 11.222.333/0001-81");
    expect(message).toContain("Razão social: Padaria Boa Vista Ltda");
    expect(message).toContain("IE: 407.123.456.789");
    expect(message).toContain("Rua Barão de Jundiaí, 100, Sala 2 — Centro, Jundiaí/SP — CEP 13201-000");
  });

  it("grava e envia o preço calculado no servidor, não o do navegador", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn((input: CreateOrderInput) => ({ id: "order-1", status: "aguardando_pagamento" as const, paymentMethod: input.paymentMethod, customer: input.customer, items: input.items }));
    const priceItems = vi.fn(async (items: CreateOrderInput["items"]) => items.map((item) => ({ ...item, unitPrice: 2.64 })));
    const cheap = { ...body, items: [{ ...body.items[0], slug: "brindes/cf93", quantity: 100, unitPrice: 0.01 }] };

    const response = await createCheckoutHandler(getSession, persistOrder, { priceItems })(requestWithBody(cheap));
    expect(response.status).toBe(200);
    expect(persistOrder.mock.calls[0][0].items[0].unitPrice).toBe(2.64);
    // Intl usa espaço não separável entre "R$" e o número; normaliza para comparar.
    const message = decodeURIComponent((await response.json()).url).replace(/ /g, " ");
    expect(message).toContain("Valor: R$ 264,00");
    expect(message).not.toContain("R$ 1,00");
  });

  it("se o catálogo falhar ao conferir os preços, não cria o pedido", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn();
    const response = await createCheckoutHandler(getSession, persistOrder, {
      priceItems: async () => { throw new Error("catálogo fora"); },
    })(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "PRICING_UNAVAILABLE" });
    expect(persistOrder).not.toHaveBeenCalled();
  });

  it("sem cadastro completo, o pedido segue sem faturamento", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn((input: CreateOrderInput) => ({ id: "order-1", status: "aguardando_pagamento" as const, paymentMethod: input.paymentMethod, customer: input.customer, items: input.items }));
    const response = await createCheckoutHandler(getSession, persistOrder, { readBilling: () => null })(request());
    expect(response.status).toBe(200);
    expect(persistOrder.mock.calls[0][0].customer).toEqual({ name: "Ana", phone: "11999999999" });
    expect(decodeURIComponent((await response.json()).url)).not.toContain("Faturar para");
  });

  it("guarda WhatsApp e empresa do pedido na conta quando ela ainda não tem telefone", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn().mockReturnValue({
      id: "order-1", status: "aguardando_pagamento", paymentMethod: "pix", customer: body.customer, items: body.items,
    });
    const rememberContact = vi.fn();
    const response = await createCheckoutHandler(getSession, persistOrder, { rememberContact })(request());

    expect(response.status).toBe(200);
    expect(rememberContact).toHaveBeenCalledWith("user-1", body.customer);
  });

  it("o pedido não falha se não conseguir guardar o contato", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1" } });
    const persistOrder = vi.fn().mockReturnValue({
      id: "order-1", status: "aguardando_pagamento", paymentMethod: "pix", customer: body.customer, items: body.items,
    });
    const response = await createCheckoutHandler(getSession, persistOrder, { rememberContact: () => { throw new Error("db"); } })(request());
    expect(response.status).toBe(200);
  });

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
