// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { closeQuote, type CloseQuoteInput } from "@/lib/quotes/closeQuote";
import { createManualQuote, findQuoteById, updateQuoteStatus } from "@/lib/quotes/repository";
import { getOrderFinance } from "@/lib/orders/payments";
import { findOrderById } from "@/lib/orders/repository";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = new DatabaseSync(":memory:"); databases.push(db);
  db.exec("PRAGMA foreign_keys = ON");
  const created = createManualQuote(db, {
    ownerId: "customer", customer: { name: "Snapshot Ana", phone: "11999999999", notes: "Original" },
    items: [{ id: "item", productName: "Produto removido", slug: "removido", quantity: 10, unitPrice: 5, selections: { Cor: "Azul" }, artworkName: null }],
    createdBy: "Bia", internalNotes: "Notas preservadas", idempotencyKey: "quote-123456", discount: { type: "percent", value: 10 },
  });
  const quote = updateQuoteStatus(db, { quoteId: created.id, nextStatus: "aguardando_pagamento" });
  const input: CloseQuoteInput = {
    quoteId: quote.id, actorId: "staff", actorName: "Bia", idempotencyKey: "close-123456", expectedUpdatedAt: quote.updatedAt,
    payment: { paymentMethod: "pix", amountCents: 2000, paidAt: "2026-10-15", installments: null, dueDate: null },
    delivery: { deliveryMode: "retirada", deliveryDate: "2026-10-23" },
  };
  return { db, quote, input };
}
describe("fechamento transacional de orçamento", () => {
  it("duas conexões SQLite concorrentes criam só um pedido e recebimento", async () => {
    const { db, input } = setup();
    // Nunca usa diretório/banco da aplicação nem o temp global do sistema.
    const scratch = process.env.TMPDIR;
    if (!scratch) throw new Error("TMPDIR de scratch obrigatório para teste concorrente.");
    const directory = mkdtempSync(join(scratch, "close-quote-"));
    const file = join(directory, "isolated.sqlite");
    db.prepare("VACUUM INTO ?").run(file);
    const workers: Worker[] = [];
    try {
      const calls = [0, 1].map(() => new Promise<string>((resolveResult, reject) => {
        const worker = new Worker(`
          const { parentPort, workerData } = require('node:worker_threads');
          const { DatabaseSync } = require('node:sqlite');
          const ts = require('typescript');
          const Module = require('node:module');
          const originalResolve = Module._resolveFilename;
          Module._resolveFilename = function(specifier, ...args) {
            if (specifier.startsWith('@/')) specifier = require('node:path').resolve(process.cwd(), 'src', specifier.slice(2));
            return originalResolve.call(this, specifier, ...args);
          };
          require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(
            require('node:fs').readFileSync(file, 'utf8'),
            { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
          ).outputText, file);
          (async () => {
            const { closeQuote } = require(require('node:url').fileURLToPath(workerData.module));
            const db = new DatabaseSync(workerData.file);
            parentPort.once('message', () => {
              try { parentPort.postMessage({ id: closeQuote(db, workerData.input).id }); }
              catch (error) { parentPort.postMessage({ error: error.message }); }
              finally { db.close(); parentPort.close(); }
            });
            parentPort.postMessage({ ready: true });
          })().catch(error => { throw error; });
        `, { eval: true, execArgv: [],
          workerData: { file, input, module: pathToFileURL(resolve("src/lib/quotes/closeQuote.ts")).href } });
        workers.push(worker);
        worker.on("error", reject);
        worker.on("message", message => {
          if (message.ready) worker.postMessage("go");
          else if (message.error) reject(new Error(message.error));
          else resolveResult(message.id);
        });
      }));
      const ids = await Promise.all(calls);
      expect(ids[0]).toBe(ids[1]);
      const persisted = new DatabaseSync(file);
      try {
        expect(persisted.prepare("SELECT count(*) n FROM fare_orders").get()).toMatchObject({ n: 1 });
        expect(persisted.prepare("SELECT count(*) n FROM fare_order_payments").get()).toMatchObject({ n: 1 });
        expect(persisted.prepare("SELECT order_id FROM fare_quotes WHERE id = ?").get(input.quoteId)).toMatchObject({ order_id: ids[0] });
      } finally { persisted.close(); }
    } finally {
      await Promise.all(workers.map(worker => worker.terminate()));
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15000);
  it("preserva snapshot/desconto e grava pedido, ledger e vínculo juntos", () => {
    const { db, quote, input } = setup();
    const order = closeQuote(db, input);
    expect(order).toMatchObject({ customer: quote.customer, items: quote.items, discount: quote.discount, totalCents: 4500, status: "aguardando_arte" });
    expect(findQuoteById(db, quote.id)).toMatchObject({ status: "virou_pedido", orderId: order.id });
    expect(getOrderFinance(db, order.id)).toMatchObject({ paidCents: 2000, balanceCents: 2500, internalNotes: quote.internalNotes, deliveryDate: "2026-10-23", createdBy: "Bia" });
    expect(findOrderById(db, order.id)?.items).toEqual(quote.items);
  });
  it("total na retirada libera arte com saldo integral e nenhum recebimento, inclusive em retry", () => {
    const { db, input, quote } = setup();
    const deferred: CloseQuoteInput = { ...input, paymentOnPickup: true, payment: { ...input.payment, amountCents: 0, paidAt: null } };
    const order = closeQuote(db, deferred);
    expect(order.status).toBe('aguardando_arte');
    expect(order.items).toEqual(quote.items);
    expect(getOrderFinance(db, order.id)).toMatchObject({ paymentOnPickup: true, paidCents: 0, balanceCents: 4500, deliveryMode: 'retirada', payments: [] });
    expect(closeQuote(db, deferred).id).toBe(order.id);
    expect(() => closeQuote(db, { ...deferred, paymentOnPickup: false })).toThrow(/fechado|reutilizada/);
    expect(db.prepare('SELECT count(*) n FROM fare_order_payments').get()).toMatchObject({ n: 0 });
  });
  it.each(['entrega', 'recebido', 'parcelas', 'tipo'])('recusa total na retirada incoerente: %s', invalid => {
    const { db, input } = setup();
    const deferred: CloseQuoteInput = { ...input, paymentOnPickup: true, payment: { ...input.payment, amountCents: 0, paidAt: null } };
    if (invalid === 'entrega') deferred.delivery = { ...deferred.delivery, deliveryMode: 'entrega' };
    if (invalid === 'recebido') deferred.payment = { ...input.payment };
    if (invalid === 'parcelas') deferred.payment = { ...deferred.payment, installments: 2 };
    if (invalid === 'tipo') Object.assign(deferred, { paymentOnPickup: 'true' });
    expect(() => closeQuote(db, deferred)).toThrow();
    expect(findQuoteById(db, input.quoteId)).toMatchObject({ status: 'aguardando_pagamento', orderId: null });
  });
  it('migra metadados antigos sem alterar recebimentos ou saldos', () => {
    const {db,input}=setup();const order=closeQuote(db,input);
    const before=getOrderFinance(db,order.id);
    db.exec('ALTER TABLE fare_order_finance DROP COLUMN payment_on_pickup');
    expect(getOrderFinance(db,order.id)).toEqual(before);
    expect(db.prepare('PRAGMA integrity_check').get()).toMatchObject({integrity_check:'ok'});
  });
  it("zero não cria recebimento nem libera arte", () => {
    const { db, input } = setup();
    const order = closeQuote(db, { ...input, payment: { ...input.payment, amountCents: 0, paidAt: null } });
    expect(order.status).toBe("aguardando_pagamento");
    expect(getOrderFinance(db, order.id)).toMatchObject({ paidCents: 0, balanceCents: 4500, payments: [] });
  });
  it("retry devolve o mesmo pedido e rejeita chave/payload divergente", () => {
    const { db, input } = setup(); const order = closeQuote(db, input);
    expect(closeQuote(db, input).id).toBe(order.id);
    expect(() => closeQuote(db, { ...input, idempotencyKey: "different-key" })).toThrow(/fechado|reutilizada/);
    expect(() => closeQuote(db, { ...input, payment: { ...input.payment, amountCents: 100 } })).toThrow(/fechado|reutilizada/);
    expect(() => closeQuote(db, { ...input, delivery: { ...input.delivery, deliveryMode: "entrega" } })).toThrow(/fechado|reutilizada/);
    expect(db.prepare("SELECT count(*) n FROM fare_orders").get()).toMatchObject({ n: 1 });
    expect(getOrderFinance(db, order.id)?.payments).toHaveLength(1);
  });
  it("recusa versão antiga, estado indevido e reutilização global de chave", () => {
    const { db, input } = setup();
    expect(() => closeQuote(db, { ...input, expectedUpdatedAt: "old" })).toThrow(/outra pessoa/);
    updateQuoteStatus(db, { quoteId: input.quoteId, nextStatus: "em_negociacao" });
    expect(() => closeQuote(db, input)).toThrow(/aguardando pagamento/);
    const other = setup(); closeQuote(other.db, other.input);
    expect(() => closeQuote(other.db, { ...other.input, quoteId: "another" })).toThrow(/reutilizada/);
  });
  it.each([
    { amountCents: 4501 }, { amountCents: -1 }, { amountCents: 0.5 },
    { paidAt: "2026-02-30" }, { paymentMethod: "crypto" }, { installments: 2 }, { dueDate: "2026-10-30" },
  ])("valida pagamento pelo domínio existente %j sem resíduos", invalid => {
    const { db, input } = setup();
    expect(() => closeQuote(db, { ...input, payment: { ...input.payment, ...invalid } } as CloseQuoteInput)).toThrow();
    expect(findQuoteById(db, input.quoteId)).toMatchObject({ status: "aguardando_pagamento", orderId: null });
    expect(db.prepare("SELECT count(*) n FROM fare_orders").get()).toMatchObject({ n: 0 });
  });
  it("rollback integral se falhar o vínculo após gravar financeiro", () => {
    const { db, input } = setup();
    // Inicializa somente schema financeiro no banco isolado.
    getOrderFinance(db, "missing");
    db.exec("CREATE TRIGGER fail_closing BEFORE UPDATE ON fare_quotes WHEN NEW.status = 'virou_pedido' BEGIN SELECT RAISE(ABORT, 'forced'); END;");
    expect(() => closeQuote(db, input)).toThrow(/forced/);
    for (const table of ["fare_orders", "fare_order_payments", "fare_order_finance", "fare_order_status_history", "fare_quote_closures"]) {
      expect(db.prepare(`SELECT count(*) n FROM ${table}`).get()).toMatchObject({ n: 0 });
    }
    expect(findQuoteById(db, input.quoteId)).toMatchObject({ status: "aguardando_pagamento", orderId: null });
    db.exec("DROP TRIGGER fail_closing");
    expect(closeQuote(db, input).status).toBe("aguardando_arte");
  });
});
