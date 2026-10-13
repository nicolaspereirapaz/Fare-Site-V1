import { describe, expect, it, vi } from "vitest";
import { createListBackofficeQuotesHandler, createUpdateBackofficeQuoteStatusHandler } from "@/lib/backoffice/quotesAccess";
import { InvalidQuoteTransitionError } from "@/lib/quotes/quoteCode";
import type { Quote } from "@/lib/quotes/repository";

const BILLING = {
  personType: "pj" as const, document: "11.222.333/0001-81", companyName: "Padaria Boa Vista Ltda", tradeName: "",
  stateRegistration: "ISENTO",
  address: { cep: "13201-000", street: "Rua A", number: "1", complement: "", district: "Centro", city: "Jundiaí", state: "SP" },
};

function buildQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "3f7a2c1b-0000-4000-8000-000000000000",
    userId: "u1",
    idempotencyKey: "orc-abc-123",
    customer: { name: "Ana", phone: "(11) 98888-7777", company: "Padaria", notes: "Até dia 20", billing: BILLING },
    items: [{ id: "l1", productName: "Caneta Plástica", slug: "brindes/cf93", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.64 }],
    status: "aguardando_orcamento",
    orderId: null,
    totalCents: 26400,
    createdBy: null,
    internalNotes: "",
    createdAt: "2026-10-08T12:00:00.000Z",
    updatedAt: "2026-10-08T12:00:00.000Z",
    ...overrides,
  };
}

const listRequest = () => new Request("http://localhost/api/backoffice/quotes");
const patch = (body: unknown) => new Request("http://localhost/api/backoffice/quotes/q", {
  method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});
const as = (role: string) => vi.fn().mockResolvedValue({ user: { id: "staff-1", role } });

describe("lista de orçamentos do painel", () => {
  it("só vendedor e admin acessam", async () => {
    expect((await createListBackofficeQuotesHandler(vi.fn().mockResolvedValue(null), () => [])(listRequest())).status).toBe(401);
    expect((await createListBackofficeQuotesHandler(as("cliente"), () => [])(listRequest())).status).toBe(403);
    expect((await createListBackofficeQuotesHandler(as("vendedor"), () => [])(listRequest())).status).toBe(200);
  });

  it("devolve número, cliente, faturamento, itens, observações, total e contagem por situação", async () => {
    const payload = await (await createListBackofficeQuotesHandler(as("admin"), () => [
      buildQuote(),
      buildQuote({ id: "99aa0000-0000-4000-8000-000000000000", status: "em_negociacao", totalCents: null }),
    ])(listRequest())).json();

    expect(payload.quotes[0]).toEqual({
      id: "3f7a2c1b-0000-4000-8000-000000000000",
      code: "ORC-3F7A2C",
      status: "aguardando_orcamento",
      customerName: "Ana",
      customerPhone: "(11) 98888-7777",
      customerCompany: "Padaria",
      notes: "Até dia 20",
      billing: BILLING,
      items: [{ productName: "Caneta Plástica", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.64 }],
      itemCount: 1,
      total: 264,
      createdBy: null,
      internalNotes: "",
      createdAt: "2026-10-08T12:00:00.000Z",
      updatedAt: "2026-10-08T12:00:00.000Z",
    });
    expect(payload.quotes[1].total).toBeNull();
    expect(payload.counts).toEqual({ aguardando_orcamento: 1, em_negociacao: 1, aguardando_pagamento: 0, virou_pedido: 0, encerrado: 0 });
  });
});

describe("mudar situação do orçamento no painel", () => {
  it("cliente não pode mudar", async () => {
    const update = vi.fn();
    const response = await createUpdateBackofficeQuoteStatusHandler(as("cliente"), () => buildQuote(), update)(patch({ status: "em_negociacao" }), "q");
    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("vendedor passa para Em negociação (e o painel registra quem mudou)", async () => {
    const update = vi.fn().mockReturnValue(buildQuote({ status: "em_negociacao" }));
    const response = await createUpdateBackofficeQuoteStatusHandler(as("vendedor"), () => buildQuote(), update)(patch({ status: "em_negociacao" }), "q");
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ quoteId: "q", nextStatus: "em_negociacao", actorId: "staff-1" });
    expect((await response.json()).quote.status).toBe("em_negociacao");
  });

  it("situação desconhecida, orçamento inexistente e salto inválido", async () => {
    const handler = (find: () => Quote | null, update = vi.fn()) => createUpdateBackofficeQuoteStatusHandler(as("admin"), find, update);
    expect((await handler(() => buildQuote())(patch({ status: "aprovado" }), "q")).status).toBe(400);
    expect((await handler(() => null)(patch({ status: "em_negociacao" }), "q")).status).toBe(404);
    const invalid = vi.fn(() => { throw new InvalidQuoteTransitionError("aguardando_orcamento", "virou_pedido"); });
    expect((await handler(() => buildQuote(), invalid)(patch({ status: "virou_pedido" }), "q")).status).toBe(409);
  });
});

describe("origem do orçamento no quadro", () => {
  it("mostra se veio do site ou quem montou no painel, e a observação interna", async () => {
    const quotes = [buildQuote(), buildQuote({ id: "91b0d400-0000-4000-8000-000000000000", userId: "painel:p1", createdBy: "Bia", internalNotes: "Arte pelo WhatsApp" })];
    const response = await createListBackofficeQuotesHandler(as("vendedor"), () => quotes)(listRequest());
    const body = await response.json() as { quotes: Array<{ createdBy: string | null; internalNotes: string; updatedAt: string }> };
    expect(body.quotes.map(({ createdBy, internalNotes }) => ({ createdBy, internalNotes }))).toEqual([
      { createdBy: null, internalNotes: "" },
      { createdBy: "Bia", internalNotes: "Arte pelo WhatsApp" },
    ]);
    expect(body.quotes[0].updatedAt).toBe("2026-10-08T12:00:00.000Z");
  });
});

