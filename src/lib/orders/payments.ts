import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createOrder, findOrderById, runOrderMigrations, type CreateOrderInput, type Order, type PaymentMethod } from "./repository";
import type { QuoteCartItem } from "@/lib/commerce";
import { applyDiscount, type QuoteDiscount } from "@/lib/quotes/discount";

export const STAFF_PAYMENT_METHODS: readonly PaymentMethod[] = [
  "pix", "dinheiro", "cartao_debito", "cartao_credito", "boleto", "faturamento_empresa",
];

export type DirectOrderInput = CreateOrderInput & {
  actorId: string; actorName: string; internalNotes: string;
  deliveryDate: string | null; deliveryMode: "retirada" | "entrega";
  /** Horário combinado ("14:30"), opcional; só junto com a data. */
  deliveryTime?: string | null;
  installments: number | null; dueDate: string | null;
  payment: { amountCents: number; paidAt: string | null };
  paymentOnPickup?: boolean;
};
export type OrderPayment = {
  id: string; amountCents: number; paymentMethod: PaymentMethod;
  paidAt: string; actorId: string; actorName: string;
};
export type OrderFinance = {
  paidCents: number; balanceCents: number; createdBy: string; internalNotes: string;
  deliveryDate: string | null; deliveryMode: "retirada" | "entrega"; deliveryTime?: string | null;
  installments: number | null; dueDate: string | null; payments: OrderPayment[];
  paymentOnPickup?: boolean;
};

function requireText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} inválido.`);
}

function requireCents(value: unknown, allowZero = false) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error("Valor em centavos inválido.");
  }
}

export function requireDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) {
    throw new Error("Data inválida; use YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data inválida.");
}

function requirePaymentMethod(value: unknown) {
  if (!STAFF_PAYMENT_METHODS.includes(value as PaymentMethod)) {
    throw new Error("Método de pagamento inválido.");
  }
}

function requireWrite(result: { changes: number | bigint }) {
  if (Number(result.changes) !== 1) throw new Error("Não foi possível persistir o financeiro/histórico do pedido.");
}

function validateDirectInput(input: DirectOrderInput) {
  requireText(input.actorId, "Ator");
  requireText(input.actorName, "Nome do ator");
  requirePaymentMethod(input.paymentMethod);
  if (typeof input.internalNotes !== "string") throw new Error("Observações internas inválidas.");
  if (input.paymentOnPickup !== undefined && typeof input.paymentOnPickup !== 'boolean') throw new Error('Condição de pagamento inválida.');
  if (input.paymentOnPickup && (input.deliveryMode !== 'retirada' || input.payment.amountCents !== 0 || input.payment.paidAt !== null || input.installments !== null || input.dueDate !== null)) {
    throw new Error('Total na retirada exige retirada na loja, sem recebimento agora, parcelas ou vencimento.');
  }
  if (input.deliveryMode !== "retirada" && input.deliveryMode !== "entrega") throw new Error("Modalidade de entrega inválida.");
  if (input.deliveryDate !== null) requireDate(input.deliveryDate);
  if (input.deliveryTime != null) {
    if (typeof input.deliveryTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.deliveryTime)) throw new Error("Horário inválido; use HH:MM.");
    if (input.deliveryDate === null) throw new Error("Informe a data junto com o horário.");
  }
  if (input.dueDate !== null) {
    if (input.paymentMethod !== "boleto" && input.paymentMethod !== "faturamento_empresa") throw new Error("Vencimento permitido apenas para boleto/faturamento.");
    requireDate(input.dueDate);
  }
  if (input.installments !== null && (input.paymentMethod !== "cartao_credito"
    || !Number.isInteger(input.installments) || input.installments < 1 || input.installments > 12)) {
    throw new Error("Parcelas permitidas de 1 a 12 somente no crédito.");
  }
  requireCents(input.payment?.amountCents, true);
  if (input.payment.amountCents > 0 || input.payment.paidAt !== null) requireDate(input.payment.paidAt);
  if (!Array.isArray(input.items) || !input.items.length) throw new Error("Itens obrigatórios.");
  for (const item of input.items) {
    if (!item || typeof item.unitPrice !== "number" || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
      || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("Preço/quantidade inválidos.");
  }
  const subtotal = Math.round(input.items.reduce((sum, item) => sum + item.unitPrice! * item.quantity, 0) * 100);
  requireCents(subtotal, true);
  if (input.discount != null && ((input.discount.type !== "percent" && input.discount.type !== "value")
    || typeof input.discount.value !== "number" || !Number.isFinite(input.discount.value) || input.discount.value < 0
    || (input.discount.type === "percent" && input.discount.value > 100))) throw new Error("Desconto inválido.");
}

function migrateFinance(db: DatabaseSync) {
  runOrderMigrations(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS fare_order_finance (
      order_id TEXT PRIMARY KEY REFERENCES fare_orders(id),
      actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL,
      internal_notes TEXT NOT NULL, delivery_date TEXT, delivery_mode TEXT NOT NULL CHECK(delivery_mode IN ('retirada', 'entrega')),
      installments INTEGER, due_date TEXT,
      payment_on_pickup INTEGER NOT NULL DEFAULT 0 CHECK(payment_on_pickup IN (0, 1))
    );
    CREATE TABLE IF NOT EXISTS fare_order_payments (
      ordinal INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL REFERENCES fare_order_finance(order_id), idempotency_key TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), payment_method TEXT NOT NULL,
      paid_at TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(order_id, idempotency_key)
    );
  `);
  const columns = db.prepare('PRAGMA table_info(fare_order_finance)').all() as { name: string }[];
  if (!columns.some(column => column.name === 'payment_on_pickup')) {
    db.exec('ALTER TABLE fare_order_finance ADD COLUMN payment_on_pickup INTEGER NOT NULL DEFAULT 0 CHECK(payment_on_pickup IN (0, 1))');
  }
  if (!columns.some(column => column.name === 'delivery_time')) db.exec('ALTER TABLE fare_order_finance ADD COLUMN delivery_time TEXT');
}

function transaction<T>(db: DatabaseSync, action: () => T): T {
  const nested = db.isTransaction;
  const savepoint = `finance_${randomUUID().replaceAll("-", "")}`;
  db.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (error) {
    db.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK");
    throw error;
  }
}

export function getOrderFinance(db: DatabaseSync, orderId: string): OrderFinance | null {
  migrateFinance(db);
  const meta = db.prepare("SELECT * FROM fare_order_finance WHERE order_id = ?").get(orderId) as {
    actor_id: string; actor_name: string; internal_notes: string; delivery_date: string | null; delivery_time: string | null;
    delivery_mode: "retirada" | "entrega"; installments: number | null; due_date: string | null;
    payment_on_pickup: number;
  } | undefined;
  if (!meta) return null;
  const rows = db.prepare("SELECT * FROM fare_order_payments WHERE order_id = ? ORDER BY ordinal").all(orderId) as unknown as Array<{
    id: string; amount_cents: number; payment_method: PaymentMethod; paid_at: string; actor_id: string; actor_name: string;
  }>;
  const payments = rows.map((row) => ({ id: row.id, amountCents: row.amount_cents, paymentMethod: row.payment_method,
    paidAt: row.paid_at, actorId: row.actor_id, actorName: row.actor_name }));
  const paidCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const order = findOrderById(db, orderId)!;
  return { paidCents, balanceCents: order.totalCents! - paidCents, createdBy: meta.actor_name,
    internalNotes: meta.internal_notes, deliveryDate: meta.delivery_date, deliveryMode: meta.delivery_mode, deliveryTime: meta.delivery_time ?? null,
    installments: meta.installments, dueDate: meta.due_date, payments, ...(meta.payment_on_pickup ? { paymentOnPickup: true } : {}) };
}

/** Muda só a data/horário de entrega previstos; pedido concluído ou cancelado fica como está. */
export function updateOrderDelivery(db: DatabaseSync, input: { orderId: string; deliveryDate: string | null; deliveryTime: string | null }): OrderFinance {
  migrateFinance(db);
  if (input.deliveryDate !== null) requireDate(input.deliveryDate);
  if (input.deliveryTime !== null) {
    if (typeof input.deliveryTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.deliveryTime)) throw new Error("Horário inválido; use HH:MM.");
    if (input.deliveryDate === null) throw new Error("Informe a data junto com o horário.");
  }
  return transaction(db, () => {
    const order = findOrderById(db, input.orderId);
    if (!order || !getOrderFinance(db, order.id)) throw new Error("Pedido sem metadados financeiros.");
    if (order.status === "cancelado" || order.status === "concluido") throw new Error("Pedido concluído ou cancelado não pode ser alterado.");
    requireWrite(db.prepare("UPDATE fare_order_finance SET delivery_date = ?, delivery_time = ? WHERE order_id = ?")
      .run(input.deliveryDate, input.deliveryTime, order.id));
    return getOrderFinance(db, order.id)!;
  });
}

export function recordOrderPayment(db: DatabaseSync, input: {
  orderId: string; idempotencyKey: string; amountCents: number; paymentMethod: PaymentMethod;
  paidAt: string; actorId: string; actorName: string;
}): OrderFinance {
  requireText(input.orderId, "Pedido");
  requireText(input.idempotencyKey, "Chave de idempotência");
  migrateFinance(db);
  return transaction(db, () => {
    const finance = getOrderFinance(db, input.orderId);
    if (!finance) throw new Error("Pedido sem metadados financeiros.");
    const existing = db.prepare("SELECT id FROM fare_order_payments WHERE order_id = ? AND idempotency_key = ?")
      .get(input.orderId, `payment:${input.idempotencyKey}`);
    if (existing) return finance;
    requireCents(input.amountCents);
    requirePaymentMethod(input.paymentMethod);
    requireDate(input.paidAt);
    requireText(input.actorId, "Ator");
    requireText(input.actorName, "Nome do ator");
    if (input.amountCents > finance.balanceCents) throw new Error("Recebimento acima do saldo do pedido.");
    const order = findOrderById(db, input.orderId)!;
    if (order.status === "cancelado" || order.status === "concluido") throw new Error("Recebimento bloqueado em pedido cancelado/concluído.");
    const now = new Date().toISOString();
    requireWrite(db.prepare(`INSERT INTO fare_order_payments
      (id, order_id, idempotency_key, amount_cents, payment_method, paid_at, actor_id, actor_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), input.orderId, `payment:${input.idempotencyKey}`, input.amountCents, input.paymentMethod,
        input.paidAt, input.actorId, input.actorName, now));
    if (order.status === "aguardando_pagamento") {
      const updated = db.prepare("UPDATE fare_orders SET status = 'aguardando_arte', updated_at = ? WHERE id = ? AND status = 'aguardando_pagamento'")
        .run(now, order.id);
      if (Number(updated.changes) !== 1) throw new Error("Não foi possível atualizar o status do pedido.");
      requireWrite(db.prepare(`INSERT INTO fare_order_status_history
        (id, order_id, previous_status, next_status, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), order.id, order.status, "aguardando_arte", input.actorId, now));
    }
    return getOrderFinance(db, input.orderId)!;
  });
}

export function createDirectOrder(db: DatabaseSync, input: DirectOrderInput): Order {
  requireText(input.userId, "Cliente");
  requireText(input.idempotencyKey, "Chave de idempotência");
  migrateFinance(db);
  return transaction(db, () => {
    const existing = db.prepare("SELECT id FROM fare_orders WHERE user_id = ? AND idempotency_key = ?")
      .get(input.userId, input.idempotencyKey) as { id: string } | undefined;
    if (existing) {
      if (!getOrderFinance(db, existing.id)) throw new Error("Pedido legado sem metadados financeiros.");
      return findOrderById(db, existing.id)!;
    }
    validateDirectInput(input);
    const order = createOrder(db, input, { initialStatus: input.payment.amountCents > 0 || input.paymentOnPickup === true ? "aguardando_arte" : "aguardando_pagamento" });
    requireCents(order.totalCents, true);
    if (input.payment.amountCents > order.totalCents!) throw new Error("Pagamento acima do total do pedido.");
    const now = new Date().toISOString();
    requireWrite(db.prepare(`INSERT INTO fare_order_finance
      (order_id, actor_id, actor_name, created_at, internal_notes, delivery_date, delivery_mode, installments, due_date, payment_on_pickup, delivery_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(order.id, input.actorId, input.actorName, now,
      input.internalNotes, input.deliveryDate, input.deliveryMode, input.installments, input.dueDate, input.paymentOnPickup === true ? 1 : 0, input.deliveryTime ?? null));
    if (input.payment.amountCents > 0) {
      requireWrite(db.prepare(`INSERT INTO fare_order_payments
        (id, order_id, idempotency_key, amount_cents, payment_method, paid_at, actor_id, actor_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), order.id, "initial", input.payment.amountCents,
        input.paymentMethod, input.payment.paidAt, input.actorId, input.actorName, now));
    }
    requireWrite(db.prepare(`INSERT INTO fare_order_status_history
      (id, order_id, previous_status, next_status, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), order.id, "aguardando_pagamento", order.status, input.actorId, now));
    return order;
  });
}

export type CloseSiteOrderInput = Pick<DirectOrderInput, "actorId" | "actorName" | "paymentMethod" | "deliveryDate" | "deliveryMode" | "deliveryTime"
  | "installments" | "dueDate" | "payment" | "paymentOnPickup"> & { orderId: string; expectedUpdatedAt: string };

/**
 * Fechar pedido do site (veio do carrinho ou das fotos, sem pagamento registrado): grava forma de pagamento,
 * entrega e o valor recebido. Com pagamento (ou "paga na retirada") vai para Pedidos; repetir não duplica.
 */
export function closeSiteOrder(db: DatabaseSync, input: CloseSiteOrderInput): Order {
  migrateFinance(db);
  return transaction(db, () => {
    const order = findOrderById(db, input.orderId);
    if (!order) throw new Error("Pedido não encontrado.");
    if (getOrderFinance(db, order.id)) return order; // já fechado (clique repetido)
    if (order.status !== "aguardando_pagamento") throw new Error("Só é possível fechar um pedido aguardando pagamento.");
    if (order.updatedAt !== input.expectedUpdatedAt) throw new Error("O pedido foi alterado por outra pessoa. Abra de novo.");
    validateDirectInput({ ...input, userId: order.userId, idempotencyKey: order.idempotencyKey, customer: order.customer, items: order.items,
      discount: order.discount, internalNotes: "" });
    requireCents(order.totalCents, true);
    if (input.payment.amountCents > order.totalCents!) throw new Error("Pagamento acima do total do pedido.");
    const now = new Date().toISOString();
    const status = input.payment.amountCents > 0 || input.paymentOnPickup === true ? "aguardando_arte" : "aguardando_pagamento";
    requireWrite(db.prepare("UPDATE fare_orders SET payment_method = ?, status = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .run(input.paymentMethod, status, now, order.id, input.expectedUpdatedAt));
    requireWrite(db.prepare(`INSERT INTO fare_order_finance
      (order_id, actor_id, actor_name, created_at, internal_notes, delivery_date, delivery_mode, installments, due_date, payment_on_pickup, delivery_time)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`).run(order.id, input.actorId, input.actorName, now, input.deliveryDate, input.deliveryMode,
      input.installments, input.dueDate, input.paymentOnPickup === true ? 1 : 0, input.deliveryTime ?? null));
    if (input.payment.amountCents > 0) {
      requireWrite(db.prepare(`INSERT INTO fare_order_payments
        (id, order_id, idempotency_key, amount_cents, payment_method, paid_at, actor_id, actor_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), order.id, "initial", input.payment.amountCents,
        input.paymentMethod, input.payment.paidAt, input.actorId, input.actorName, now));
    }
    if (status !== order.status) {
      requireWrite(db.prepare(`INSERT INTO fare_order_status_history
        (id, order_id, previous_status, next_status, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), order.id, order.status, status, input.actorId, now));
    }
    return findOrderById(db, order.id)!;
  });
}

/** Pedido pode ter os itens alterados enquanto não foi concluído nem cancelado. */
export const ORDER_EDITABLE_STATUSES = [
  "aguardando_pagamento", "aguardando_arte", "criando_arte", "aguardando_producao", "em_producao", "aguardando_retirada", "aguardando_feedback",
];
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Equipe edita o pedido: troca itens, desconto e observação interna. Pagamentos e entrega não mudam aqui.
 * O total novo nunca fica abaixo do que já foi recebido; mudança de outra pessoa no meio do caminho é recusada.
 */
export function replaceOrderItems(db: DatabaseSync, input: {
  orderId: string; items: QuoteCartItem[]; discount?: QuoteDiscount | null; internalNotes?: string; expectedUpdatedAt: string;
}): Order {
  migrateFinance(db);
  const order = findOrderById(db, input.orderId);
  if (!order) throw new Error("Pedido não encontrado.");
  if (!ORDER_EDITABLE_STATUSES.includes(order.status)) throw new Error("Este pedido já foi concluído ou cancelado e não pode mais ser alterado.");
  if (!input.items.length) throw new Error("O pedido precisa de pelo menos um item.");
  if (input.items.some((item) => item.unitPrice === null)) throw new Error("Há item sem preço.");
  const discount = input.discount === undefined ? order.discount : input.discount;
  const subtotal = Math.round(input.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
  const total = applyDiscount(subtotal, discount ?? null).totalCents;
  const paid = getOrderFinance(db, order.id)?.paidCents ?? 0;
  if (total < paid) throw new Error(`O novo total (${money(total)}) fica menor que o valor já recebido (${money(paid)}).`);
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = db.prepare("UPDATE fare_orders SET items_snapshot = ?, total_cents = ?, discount_json = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .run(JSON.stringify(input.items), total, discount ? JSON.stringify(discount) : null, new Date().toISOString(), order.id, input.expectedUpdatedAt);
    if (Number(result.changes) !== 1) throw new Error("O pedido foi alterado por outra pessoa. Abra de novo.");
    if (input.internalNotes !== undefined) db.prepare("UPDATE fare_order_finance SET internal_notes = ? WHERE order_id = ?").run(input.internalNotes, order.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return findOrderById(db, order.id)!;
}
