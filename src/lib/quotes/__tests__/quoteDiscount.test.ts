import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { QuoteCartItem } from "@/lib/commerce";
import { findOrderById } from "@/lib/orders/repository";
import { convertQuoteToOrder, createManualQuote, createQuote, findQuoteById, replaceQuoteItems, updateQuoteStatus } from "@/lib/quotes/repository";

const item = (unitPrice: number, quantity: number, id = "i1"): QuoteCartItem => ({
  id, productName: "Caneta", slug: "brindes/cf93", quantity, selections: {}, artworkName: null, unitPrice,
});
const customer = { name: "Ana Souza", phone: "(11) 98888-7777" };

describe("desconto gravado no orçamento", () => {
  it("cria com desconto: total já descontado e o desconto fica guardado", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createManualQuote(db, {
      ownerId: "painel:p1", customer, items: [item(8, 300)], createdBy: "Bia", internalNotes: "", idempotencyKey: "k1",
      discount: { type: "percent", value: 10 },
    });
    expect(quote).toMatchObject({ totalCents: 216000, discount: { type: "percent", value: 10 } });
    expect(findQuoteById(db, quote.id)).toMatchObject({ totalCents: 216000, discount: { type: "percent", value: 10 } });
  });

  it("sem desconto continua como antes (orçamentos antigos e do site)", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "k", customer, items: [item(8, 300)] });
    expect(findQuoteById(db, quote.id)).toMatchObject({ totalCents: 240000, discount: null });
  });

  it("editar troca ou tira o desconto", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createManualQuote(db, { ownerId: "painel:p1", customer, items: [item(8, 300)], createdBy: "Bia", internalNotes: "", idempotencyKey: "k1", discount: null });
    const comValor = replaceQuoteItems(db, { quoteId: quote.id, items: [item(8, 300)], internalNotes: "", expectedUpdatedAt: quote.updatedAt, discount: { type: "value", value: 150 } });
    expect(comValor).toMatchObject({ totalCents: 225000, discount: { type: "value", value: 150 } });
    const semDesconto = replaceQuoteItems(db, { quoteId: quote.id, items: [item(8, 300)], internalNotes: "", expectedUpdatedAt: comValor.updatedAt, discount: null });
    expect(findQuoteById(db, semDesconto.id)).toMatchObject({ totalCents: 240000, discount: null });
  });

  it("recusa desconto maior que o subtotal", () => {
    const db = new DatabaseSync(":memory:");
    expect(() => createManualQuote(db, {
      ownerId: "painel:p1", customer, items: [item(1, 10)], createdBy: "Bia", internalNotes: "", idempotencyKey: "k1",
      discount: { type: "value", value: 50 },
    })).toThrow("O desconto não pode ser maior que o subtotal.");
  });

  it("pagamento recebido: o pedido leva o mesmo desconto e o mesmo total", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createManualQuote(db, {
      ownerId: "painel:p1", customer, items: [item(8, 300)], createdBy: "Bia", internalNotes: "", idempotencyKey: "k1",
      discount: { type: "value", value: 150 },
    });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" });
    const { order } = convertQuoteToOrder(db, { quoteId: quote.id, actorId: "equipe-1" });
    expect(findOrderById(db, order.id)).toMatchObject({ totalCents: 225000, discount: { type: "value", value: 150 } });
  });
});
