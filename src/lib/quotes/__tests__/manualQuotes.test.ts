import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { QuoteCartItem } from "@/lib/commerce";
import { createManualQuote, createQuote, findQuoteById, listQuotesByOwners, replaceQuoteItems, updateQuoteStatus } from "@/lib/quotes/repository";

const item = (unitPrice: number | null, quantity = 10): QuoteCartItem => ({
  id: "i1", productName: "Caneta", slug: "brindes/cf93", quantity, selections: { "Variação": "Azul" }, artworkName: null, unitPrice,
});
const customer = { name: "Ana Souza", company: "Padaria Boa Vista", phone: "(11) 98888-7777", email: "ana@exemplo.com" };

describe("orçamento feito no painel", () => {
  it("cria com dono, autor e observação interna; aparece para o dono", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createManualQuote(db, { ownerId: "painel:p1", customer, items: [item(5.77, 300)], createdBy: "Bia", internalNotes: "Entrega até 30/10", idempotencyKey: "k1" });
    expect(quote).toMatchObject({ userId: "painel:p1", status: "aguardando_orcamento", createdBy: "Bia", internalNotes: "Entrega até 30/10", totalCents: 173100 });
    expect(findQuoteById(db, quote.id)).toMatchObject({ createdBy: "Bia", internalNotes: "Entrega até 30/10" });
    // Duplo clique não cria dois.
    expect(createManualQuote(db, { ownerId: "painel:p1", customer, items: [item(5.77, 300)], createdBy: "Bia", internalNotes: "", idempotencyKey: "k1" }).id).toBe(quote.id);
  });

  it("orçamento do site continua sem autor", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "k", customer, items: [item(null)] });
    expect(findQuoteById(db, quote.id)).toMatchObject({ createdBy: null, internalNotes: "" });
  });

  it("Minha conta lista os orçamentos de todos os donos ligados à conta", () => {
    const db = new DatabaseSync(":memory:");
    createQuote(db, { userId: "u1", idempotencyKey: "a", customer, items: [item(1)] });
    createManualQuote(db, { ownerId: "painel:p1", customer, items: [item(2)], createdBy: "Bia", internalNotes: "", idempotencyKey: "b" });
    createManualQuote(db, { ownerId: "painel:outro", customer, items: [item(3)], createdBy: "Bia", internalNotes: "", idempotencyKey: "c" });
    expect(listQuotesByOwners(db, ["u1", "painel:p1"]).map((quote) => quote.items[0].unitPrice).sort()).toEqual([1, 2]);
    expect(listQuotesByOwners(db, [])).toEqual([]);
  });
});

describe("editar os itens de um orçamento", () => {
  it("troca os itens, recalcula o total e salva a observação interna", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "k", customer, items: [item(null)] });
    const updated = replaceQuoteItems(db, { quoteId: quote.id, items: [item(4, 100), { ...item(126, 2), id: "i2", slug: "avulso:x" }], internalNotes: "ok", expectedUpdatedAt: quote.updatedAt });
    expect(updated.totalCents).toBe(65200);
    expect(findQuoteById(db, quote.id)).toMatchObject({ totalCents: 65200, internalNotes: "ok" });
  });

  it("recusa se outra pessoa mudou antes ou se o orçamento já fechou", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "k", customer, items: [item(null)] });
    expect(() => replaceQuoteItems(db, { quoteId: quote.id, items: [item(1)], internalNotes: "", expectedUpdatedAt: "2000-01-01" })).toThrow(/outra pessoa/);
    updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "encerrado" });
    const fresh = findQuoteById(db, quote.id)!;
    expect(() => replaceQuoteItems(db, { quoteId: quote.id, items: [item(1)], internalNotes: "", expectedUpdatedAt: fresh.updatedAt })).toThrow(/não pode mais/);
  });
});

describe("migração", () => {
  it("banco antigo ganha as colunas de autor e observação interna sem perder nada", () => {
    const db = new DatabaseSync(":memory:");
    const quote = createQuote(db, { userId: "u1", idempotencyKey: "k", customer, items: [item(1)] });
    db.exec("ALTER TABLE fare_quotes DROP COLUMN created_by; ALTER TABLE fare_quotes DROP COLUMN internal_notes;");
    expect(findQuoteById(db, quote.id)).toMatchObject({ id: quote.id, createdBy: null, internalNotes: "" });
  });
});
