import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createQuote, listQuotesByUser, quoteCode } from "@/lib/quotes/repository";

const ITEMS = [{
  id: "l1", productName: "Caneta Plástica", slug: "brindes/cf93", quantity: 100,
  selections: { "Variação": "Azul" }, artworkName: null, unitPrice: 2.64,
}];

describe("orçamentos no banco", () => {
  it("cria o orçamento com status 'aguardando resposta' e total estimado", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "orc-abc-123", customer: { name: "Ana", phone: "(11) 98888-7777" }, items: ITEMS });
    expect(quote).toMatchObject({ userId: "u1", status: "aguardando_resposta", totalCents: 26400, items: ITEMS });
    expect(quote.customer).toEqual({ name: "Ana", phone: "(11) 98888-7777" });
  });

  it("repetir a mesma chave não duplica (clique duplo)", () => {
    const db = new DatabaseSync(":memory:");
    const input = { userId: "u1", idempotencyKey: "orc-abc-123", customer: { name: "Ana" }, items: ITEMS };
    const a = createQuote(db, input);
    const b = createQuote(db, input);
    expect(b.id).toBe(a.id);
    expect(listQuotesByUser(db, "u1")).toHaveLength(1);
  });

  it("lista só os orçamentos do próprio cliente, mais recentes primeiro", () => {
    const db = new DatabaseSync(":memory:");
    createQuote(db, { userId: "u1", idempotencyKey: "orc-1-aaaa", customer: { name: "Ana" }, items: ITEMS });
    createQuote(db, { userId: "u2", idempotencyKey: "orc-2-aaaa", customer: { name: "Beto" }, items: ITEMS });
    createQuote(db, { userId: "u1", idempotencyKey: "orc-3-aaaa", customer: { name: "Ana" }, items: [{ ...ITEMS[0], unitPrice: null }] });
    const quotes = listQuotesByUser(db, "u1");
    expect(quotes).toHaveLength(2);
    expect(quotes[0].totalCents).toBeNull();
    expect(quotes.every((quote) => quote.userId === "u1")).toBe(true);
  });

  it("número curto ORC-XXXXXX", () => {
    expect(quoteCode("3f7a2c1b-0000-4000-8000-000000000000")).toBe("ORC-3F7A2C");
  });
});
