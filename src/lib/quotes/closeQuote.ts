import type { DatabaseSync } from "node:sqlite";
import { createDirectOrder, type DirectOrderInput } from "@/lib/orders/payments";
import { findOrderById, runOrderMigrations, type Order } from "@/lib/orders/repository";
import { findQuoteById, runQuoteMigrations } from "@/lib/quotes/repository";
import { NO_CUSTOMER_OWNER } from "@/lib/quotes/quoteCode";

export type CloseQuoteInput = {
  quoteId: string; actorId: string; actorName: string;
  idempotencyKey: string; expectedUpdatedAt: string;
  payment: DirectOrderInput["payment"] & Pick<DirectOrderInput, "paymentMethod" | "installments" | "dueDate">;
  delivery: Pick<DirectOrderInput, "deliveryDate" | "deliveryMode" | "deliveryTime">;
  paymentOnPickup?: boolean;
};

export class CloseQuoteError extends Error {
  constructor(public readonly reason: "QUOTE_NOT_FOUND" | "CONFLICT" | "INVALID_REQUEST", message: string) { super(message); }
}

/** A trava de escrita cobre leitura, versão, idempotência, pedido e financeiro. */
const OPEN_STATUSES: string[] = ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"];

export function closeQuote(db: DatabaseSync, input: CloseQuoteInput): Order {
  if (input.paymentOnPickup !== undefined && typeof input.paymentOnPickup !== 'boolean') throw new CloseQuoteError('INVALID_REQUEST', 'Condição de pagamento inválida.');
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 80
    || typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt) {
    throw new CloseQuoteError("INVALID_REQUEST", "Chave ou versão do orçamento inválida.");
  }
  runQuoteMigrations(db);
  runOrderMigrations(db);
  db.exec(`CREATE TABLE IF NOT EXISTS fare_quote_closures (
    quote_id TEXT PRIMARY KEY REFERENCES fare_quotes(id), idempotency_key TEXT NOT NULL UNIQUE,
    payload TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES fare_orders(id)
  )`);
  // Ordem explícita: propriedades JSON em outra ordem não mudam a identidade.
  const payload = JSON.stringify({ quoteId: input.quoteId, expectedUpdatedAt: input.expectedUpdatedAt,
    payment: { paymentMethod: input.payment.paymentMethod, amountCents: input.payment.amountCents,
      paidAt: input.payment.paidAt, installments: input.payment.installments, dueDate: input.payment.dueDate },
    delivery: { deliveryDate: input.delivery.deliveryDate, deliveryMode: input.delivery.deliveryMode, ...(input.delivery.deliveryTime ? { deliveryTime: input.delivery.deliveryTime } : {}) },
    ...(input.paymentOnPickup === true ? { paymentOnPickup: true } : {}) });
  db.exec("BEGIN IMMEDIATE");
  try {
    const previous = db.prepare("SELECT quote_id, idempotency_key, payload, order_id FROM fare_quote_closures WHERE quote_id = ? OR idempotency_key = ?")
      .get(input.quoteId, input.idempotencyKey) as { quote_id: string; idempotency_key: string; payload: string; order_id: string } | undefined;
    if (previous) {
      if (previous.quote_id !== input.quoteId || previous.idempotency_key !== input.idempotencyKey || previous.payload !== payload) {
        throw new CloseQuoteError("CONFLICT", "Orçamento já fechado ou chave reutilizada com dados diferentes.");
      }
      const order = findOrderById(db, previous.order_id);
      if (!order) throw new Error("Pedido vinculado não encontrado.");
      db.exec("COMMIT");
      return order;
    }
    const quote = findQuoteById(db, input.quoteId);
    if (!quote) throw new CloseQuoteError("QUOTE_NOT_FOUND", "Orçamento não encontrado.");
    // Fecha de qualquer etapa aberta (também direto da negociação), não só de "aguardando pagamento".
    if (!OPEN_STATUSES.includes(quote.status) || quote.orderId) throw new CloseQuoteError("CONFLICT", "Só é possível fechar um orçamento em aberto.");
    if (quote.updatedAt !== input.expectedUpdatedAt) throw new CloseQuoteError("CONFLICT", "O orçamento foi alterado por outra pessoa. Abra de novo.");
    if (quote.userId === NO_CUSTOMER_OWNER) throw new CloseQuoteError("INVALID_REQUEST", "Selecione o cliente antes de fechar o orçamento.");
    // Não reaproveitar pedidos legados criados pela conversão antiga sem ledger.
    const orderKey = `orc:${quote.id}`;
    if (db.prepare("SELECT id FROM fare_orders WHERE user_id = ? AND idempotency_key = ?").get(quote.userId, orderKey)) {
      throw new CloseQuoteError("CONFLICT", "Este orçamento já possui um pedido.");
    }
    const order = createDirectOrder(db, {
      userId: quote.userId, customer: quote.customer, items: quote.items, discount: quote.discount,
      idempotencyKey: orderKey, actorId: input.actorId, actorName: input.actorName, internalNotes: quote.internalNotes,
      paymentMethod: input.payment.paymentMethod, installments: input.payment.installments, dueDate: input.payment.dueDate,
      payment: { amountCents: input.payment.amountCents, paidAt: input.payment.paidAt }, ...input.delivery,
      paymentOnPickup: input.paymentOnPickup === true,
    });
    if (order.totalCents !== quote.totalCents) throw new CloseQuoteError("CONFLICT", "Total do orçamento inconsistente. Revise antes de fechar.");
    const version = new Date(Math.max(Date.now(), Date.parse(quote.updatedAt) + 1)).toISOString();
    const updated = db.prepare("UPDATE fare_quotes SET status = 'virou_pedido', order_id = ?, updated_at = ? WHERE id = ? AND updated_at = ? AND status IN ('aguardando_orcamento', 'em_negociacao', 'aguardando_pagamento') AND order_id IS NULL")
      .run(order.id, version, quote.id, input.expectedUpdatedAt);
    if (Number(updated.changes) !== 1) throw new CloseQuoteError("CONFLICT", "O orçamento mudou. Abra de novo.");
    const persisted = db.prepare("INSERT INTO fare_quote_closures (quote_id, idempotency_key, payload, order_id) VALUES (?, ?, ?, ?)")
      .run(quote.id, input.idempotencyKey, payload, order.id);
    if (Number(persisted.changes) !== 1) throw new Error("Não foi possível persistir o fechamento.");
    db.exec("COMMIT");
    return order;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
