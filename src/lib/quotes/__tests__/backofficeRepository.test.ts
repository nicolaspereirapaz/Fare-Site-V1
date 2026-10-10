import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { findOrderById, listOrderStatusHistory } from "@/lib/orders/repository";
import { canTransitionQuote, InvalidQuoteTransitionError } from "@/lib/quotes/quoteCode";
import { convertQuoteToOrder, createQuote, findQuoteById, listAllQuotes, updateQuoteStatus } from "@/lib/quotes/repository";

const ITEMS = [{
  id: "l1", productName: "Caneta Plástica", slug: "brindes/cf93", quantity: 100,
  selections: { "Variação": "Azul" }, artworkName: null, unitPrice: 2.64,
}];

describe("situação do orçamento", () => {
  it("aguardando orçamento → em negociação → aguardando pagamento → vira pedido", () => {
    expect(canTransitionQuote("aguardando_orcamento", "em_negociacao")).toBe(true);
    expect(canTransitionQuote("em_negociacao", "aguardando_pagamento")).toBe(true);
    expect(canTransitionQuote("aguardando_pagamento", "virou_pedido")).toBe(true);
    expect(canTransitionQuote("aguardando_pagamento", "em_negociacao")).toBe(true);
    expect(canTransitionQuote("em_negociacao", "aguardando_orcamento")).toBe(true);
    for (const status of ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"] as const) {
      expect(canTransitionQuote(status, "encerrado")).toBe(true);
    }
    expect(canTransitionQuote("aguardando_orcamento", "virou_pedido")).toBe(false);
    expect(canTransitionQuote("em_negociacao", "virou_pedido")).toBe(false);
    expect(canTransitionQuote("virou_pedido", "encerrado")).toBe(false);
    expect(canTransitionQuote("encerrado", "em_negociacao")).toBe(false);
  });
});

describe("orçamentos no painel interno (banco)", () => {
  it("lista todos os orçamentos, de todos os clientes", () => {
    const db = new DatabaseSync(":memory:");
    createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana" }, items: ITEMS });
    createQuote(db, { userId: "u2", idempotencyKey: "orc-2-aaaa", customer: { name: "Beto" }, items: ITEMS });
    const all = listAllQuotes(db);
    expect(all.map((quote) => quote.customer.name).sort()).toEqual(["Ana", "Beto"]);
    expect(all.every((quote) => quote.status === "aguardando_orcamento" && quote.orderId === null)).toBe(true);
  });

  it("muda a situação seguindo o fluxo e recusa saltos", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana" }, items: ITEMS });

    expect(() => updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" })).toThrow(InvalidQuoteTransitionError);
    expect(updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "em_negociacao" }).status).toBe("em_negociacao");
    expect(updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" }).status).toBe("aguardando_pagamento");
    expect(findQuoteById(db, quote.id)?.status).toBe("aguardando_pagamento");
  });

  it("'virou pedido' não pode ser só uma troca de situação: precisa criar o pedido", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana" }, items: ITEMS });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "em_negociacao" });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" });
    expect(() => updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "virou_pedido" })).toThrow(InvalidQuoteTransitionError);
  });

  it("pagamento recebido: cria o pedido em 'Aguardando arte' com os mesmos itens e liga ao orçamento", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana", phone: "11999990000" }, items: ITEMS });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "em_negociacao" });
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" });

    const { quote: converted, order } = convertQuoteToOrder(db, { quoteId: quote.id, actorId: "equipe-1" });

    expect(converted).toMatchObject({ status: "virou_pedido", orderId: order.id });
    expect(findQuoteById(db, quote.id)).toMatchObject({ status: "virou_pedido", orderId: order.id });
    expect(findOrderById(db, order.id)).toMatchObject({ userId: "u1", status: "aguardando_arte", items: ITEMS, customer: { name: "Ana", phone: "11999990000" } });
    expect(listOrderStatusHistory(db, order.id)).toEqual([
      expect.objectContaining({ previousStatus: "aguardando_pagamento", nextStatus: "aguardando_arte", actorId: "equipe-1" }),
    ]);
    expect(() => convertQuoteToOrder(db, { quoteId: quote.id, actorId: "equipe-1" })).toThrow(InvalidQuoteTransitionError);
  });

  it("só converte a partir de 'Aguardando pagamento'", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana" }, items: ITEMS });
    expect(() => convertQuoteToOrder(db, { quoteId: quote.id, actorId: "equipe-1" })).toThrow(InvalidQuoteTransitionError);
    expect(findQuoteById(db, quote.id)?.status).toBe("aguardando_orcamento");
  });

  it("orçamentos antigos são migrados para as situações novas", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE fare_quotes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, customer_snapshot TEXT NOT NULL,
        items_snapshot TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('aguardando_resposta', 'respondido', 'virou_pedido', 'encerrado')),
        total_cents INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (user_id, idempotency_key));
      INSERT INTO fare_quotes VALUES ('a', 'u1', 'k1', '{"name":"Ana"}', '[]', 'aguardando_resposta', NULL, '2026-10-01', '2026-10-01');
      INSERT INTO fare_quotes VALUES ('b', 'u1', 'k2', '{"name":"Ana"}', '[]', 'respondido', NULL, '2026-10-01', '2026-10-01');
    `);
    expect(findQuoteById(db, "a")?.status).toBe("aguardando_orcamento");
    expect(findQuoteById(db, "b")).toMatchObject({ status: "em_negociacao", orderId: null });
  });

  it("orçamento inexistente devolve null", () => {
    const db = new DatabaseSync(":memory:");
    expect(findQuoteById(db, "nao-existe")).toBeNull();
  });
});
