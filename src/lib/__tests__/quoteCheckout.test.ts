import { describe, expect, it, vi } from "vitest";
import { createQuoteHandler } from "@/lib/checkout";
import type { CreateQuoteInput } from "@/lib/quotes/repository";

const body = {
  customer: { name: "Ana", phone: "(11) 98888-7777", notes: "Preciso até dia 20" },
  idempotencyKey: "orcamento-abc-123",
  items: [{
    id: "l1", productName: "Caneta Plástica", slug: "brindes/cf93", quantity: 100,
    selections: { "Variação": "Azul" }, artworkName: null, unitPrice: 0.01,
  }],
};

const post = (value: unknown) => new Request("http://localhost/api/quotes", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(value),
});

const persisted = (input: CreateQuoteInput) => ({
  id: "3f7a2c1b-0000-4000-8000-000000000000", status: "aguardando_orcamento" as const, orderId: null, customer: input.customer, items: input.items,
});

describe("pedido de orçamento pelo carrinho", () => {
  it("exige login", async () => {
    const persistQuote = vi.fn();
    const response = await createQuoteHandler(async () => null, persistQuote)(post(body));
    expect(response.status).toBe(401);
    expect(persistQuote).not.toHaveBeenCalled();
  });

  it("não pede forma de pagamento, grava no usuário da sessão e monta a mensagem de orçamento", async () => {
    const persistQuote = vi.fn(persisted);
    const priceItems = vi.fn(async (items: CreateQuoteInput["items"]) => items.map((item) => ({ ...item, unitPrice: 2.64 })));
    const response = await createQuoteHandler(async () => ({ user: { id: "u1" } }), persistQuote, { priceItems })(post({ ...body, userId: "forjado" }));

    expect(response.status).toBe(200);
    expect(persistQuote).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", idempotencyKey: "orcamento-abc-123" }));
    expect(persistQuote.mock.calls[0][0].items[0].unitPrice).toBe(2.64);

    const data = await response.json();
    expect(data.quoteId).toBe("3f7a2c1b-0000-4000-8000-000000000000");
    const message = decodeURIComponent(data.url).replace(/\u00a0/g, " ");
    expect(message).toContain("Orçamento #ORC-3F7A2C");
    expect(message).toContain("Pedido de orçamento — Fare Foto");
    expect(message).toContain("Valor: R$ 264,00");
    expect(message).toContain("Preciso até dia 20");
    expect(message).not.toContain("Pagamento informado");
  });

  it("anexa o faturamento do cadastro, como no pedido", async () => {
    const billing = {
      personType: "pf" as const, document: "529.982.247-25", companyName: "", tradeName: "", stateRegistration: "",
      address: { cep: "13201-000", street: "Rua A", number: "1", complement: "", district: "Centro", city: "Jundiaí", state: "SP" },
    };
    const persistQuote = vi.fn(persisted);
    await createQuoteHandler(async () => ({ user: { id: "u1" } }), persistQuote, { readBilling: () => billing })(post(body));
    expect(persistQuote.mock.calls[0][0].customer.billing).toEqual(billing);
  });

  it("rejeita carrinho vazio ou item inválido", async () => {
    const persistQuote = vi.fn();
    const handler = createQuoteHandler(async () => ({ user: { id: "u1" } }), persistQuote);
    expect((await handler(post({ ...body, items: [] }))).status).toBe(400);
    expect((await handler(post({ ...body, items: [{ ...body.items[0], quantity: 0 }] }))).status).toBe(400);
    expect(persistQuote).not.toHaveBeenCalled();
  });

  it("responde erro controlado se não conseguir salvar", async () => {
    const response = await createQuoteHandler(async () => ({ user: { id: "u1" } }), () => { throw new Error("db"); })(post(body));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "QUOTE_CREATION_FAILED" });
  });
});
