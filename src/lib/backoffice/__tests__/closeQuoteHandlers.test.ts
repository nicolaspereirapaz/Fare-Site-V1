// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloseQuoteHandler } from "@/lib/backoffice/closeQuoteHandlers";
import { createManualQuote, updateQuoteStatus } from "@/lib/quotes/repository";
import { orderCode } from "@/lib/orders/orderCode";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup(role: string | null = "vendedor") {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  const quote = createManualQuote(db, { ownerId: "customer", customer: { name: "Ana" }, items: [{ id: "a", productName: "Banner", slug: "removido", quantity: 10, unitPrice: 5, selections: {}, artworkName: null }], createdBy: "Bia", internalNotes: "", idempotencyKey: "quote-123456" });
  const current = updateQuoteStatus(db, { quoteId: quote.id, nextStatus: "aguardando_pagamento" });
  const database = vi.fn(() => db);
  const handler = createCloseQuoteHandler({ database, getSession: vi.fn().mockResolvedValue(role ? { user: { id: "staff", name: "Bia", role } } : null) });
  const body = { idempotencyKey: "close-123456", expectedUpdatedAt: current.updatedAt, paymentMethod: "pix", payment: { amountCents: 2000, paidAt: "2026-10-15" }, installments: null, dueDate: null, deliveryDate: "2026-10-23", deliveryMode: "retirada" };
  const post = (raw: unknown = body, headers: Record<string, string> = {}) => new Request("http://x/api/backoffice/quotes/" + quote.id + "/fechar", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(raw) });
  return { db, handler, body, post, id: quote.id, database };
}
describe("POST fechar orçamento", () => {
  it.each([null, "cliente"])("nega sessão/papel %s antes de acessar banco", async role => {
    const s = setup(role); expect((await s.handler(s.post(), s.id)).status).toBe(role ? 403 : 401); expect(s.database).not.toHaveBeenCalled();
  });
  it("aplica origem e JSON existentes", async () => {
    const s = setup();
    expect((await s.handler(s.post(s.body, { origin: "http://evil" }), s.id)).status).toBe(403);
    expect((await s.handler(s.post(s.body, { "content-type": "text/plain" }), s.id)).status).toBe(415);
    expect(s.database).not.toHaveBeenCalled();
  });
  it("retorna contrato utilizável e retries concorrentes não duplicam", async () => {
    const s = setup(); const responses = await Promise.all([s.handler(s.post(), s.id), s.handler(s.post(), s.id)]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const [a, b] = await Promise.all(responses.map(r => r.json()));
    expect(a).toEqual(b); expect(a).toEqual({ order: { id: expect.any(String), code: orderCode(a.order.id), status: "aguardando_arte" } });
    expect(s.db.prepare("SELECT count(*) n FROM fare_orders").get()).toMatchObject({ n: 1 });
    expect(s.db.prepare("SELECT count(*) n FROM fare_order_payments").get()).toMatchObject({ n: 1 });
  });
  it('aceita a condição explícita de retirada e rejeita um tipo inválido', async () => {
    const s=setup();const deferred={...s.body,paymentOnPickup:true,payment:{amountCents:0,paidAt:null}};
    expect((await s.handler(s.post({...deferred,paymentOnPickup:'true'}),s.id)).status).toBe(400);
    const response=await s.handler(s.post(deferred),s.id);expect(response.status).toBe(200);expect((await response.json()).order.status).toBe('aguardando_arte');
    expect(s.db.prepare('SELECT count(*) n FROM fare_order_payments').get()).toMatchObject({n:0});
  });
  it("rejeita campos de preço/snapshot e estruturas incompletas", async () => {
    const s = setup();
    for (const invalid of [{ ...s.body, items: [] }, { ...s.body, customer: {} }, { ...s.body, discount: null }, { ...s.body, payment: [] }, { ...s.body, payment: null }, { ...s.body, delivery: {} }, { ...s.body, expectedUpdatedAt: "" }]) {
      expect((await s.handler(s.post(invalid), s.id)).status).toBe(400);
    }
  });
  it("mapeia 404 e conflitos 409; não expõe SQLite", async () => {
    const s = setup(); expect((await s.handler(s.post(), "missing")).status).toBe(404);
    expect((await s.handler(s.post({ ...s.body, expectedUpdatedAt: "old" }), s.id)).status).toBe(409);
    expect((await s.handler(s.post(), s.id)).status).toBe(200);
    expect((await s.handler(s.post({ ...s.body, payment: { ...s.body.payment, amountCents: 1 } }), s.id)).status).toBe(409);
  });
});
