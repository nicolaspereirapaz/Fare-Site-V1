import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { QuoteCartItem, QuoteCustomer } from "@/lib/commerce";
import { createOrder, runOrderMigrations, type Order } from "@/lib/orders/repository";
import {
  canTransitionQuote,
  InvalidQuoteTransitionError,
  LEGACY_QUOTE_STATUSES,
  QUOTE_STATUSES,
  type QuoteStatus,
} from "@/lib/quotes/quoteCode";

export { QUOTE_STATUSES, quoteCode, type QuoteStatus } from "@/lib/quotes/quoteCode";

/**
 * Orçamentos pedidos pelo carrinho ("Só quero um orçamento"): sem forma de pagamento,
 * separados dos pedidos. A equipe responde pelo WhatsApp.
 */

export type CreateQuoteInput = {
  userId: string;
  idempotencyKey: string;
  customer: QuoteCustomer;
  items: QuoteCartItem[];
};

export type Quote = CreateQuoteInput & {
  id: string;
  status: QuoteStatus;
  /** Pedido gerado quando o orçamento foi pago (situação virou_pedido). */
  orderId: string | null;
  totalCents: number | null;
  /** Nome de quem montou o orçamento no painel (null = pedido pelo site). */
  createdBy: string | null;
  /** Observação só da equipe. */
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

type QuoteRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  customer_snapshot: string;
  items_snapshot: string;
  status: QuoteStatus;
  total_cents: number | null;
  order_id?: string | null;
  created_by?: string | null;
  internal_notes?: string | null;
  created_at: string;
  updated_at: string;
};

const quotesTableSql = (name: string) => `
  CREATE TABLE ${name} (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    customer_snapshot TEXT NOT NULL,
    items_snapshot TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (${QUOTE_STATUSES.map((s) => `'${s}'`).join(", ")})),
    total_cents INTEGER,
    order_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, idempotency_key)
  )`;

const LEGACY_CASE = `CASE status ${Object.entries(LEGACY_QUOTE_STATUSES)
  .map(([legacy, current]) => `WHEN '${legacy}' THEN '${current}'`)
  .join(" ")} ELSE status END`;

export function runQuoteMigrations(database: DatabaseSync) {
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`${quotesTableSql("IF NOT EXISTS fare_quotes")};`);

  // Tabela antiga (aguardando_resposta/respondido, sem order_id): recria com as situações novas.
  const current = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fare_quotes'").get() as { sql: string };
  if (!current.sql.includes("'aguardando_orcamento'") || !current.sql.includes("order_id")) {
    const hasOrderId = current.sql.includes("order_id");
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(`
        ${quotesTableSql("fare_quotes_migration")};
        INSERT INTO fare_quotes_migration (id, user_id, idempotency_key, customer_snapshot, items_snapshot, status, total_cents, order_id, created_at, updated_at)
          SELECT id, user_id, idempotency_key, customer_snapshot, items_snapshot, ${LEGACY_CASE}, total_cents, ${hasOrderId ? "order_id" : "NULL"}, created_at, updated_at
          FROM fare_quotes;
        DROP TABLE fare_quotes;
        ALTER TABLE fare_quotes_migration RENAME TO fare_quotes;
      `);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.exec("CREATE INDEX IF NOT EXISTS fare_quotes_user ON fare_quotes (user_id, created_at);");

  // Orçamento feito no painel: autor e observação interna (colunas novas, opcionais).
  const columns = new Set((database.prepare("PRAGMA table_info(fare_quotes)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!columns.has("created_by")) database.exec("ALTER TABLE fare_quotes ADD COLUMN created_by TEXT");
  if (!columns.has("internal_notes")) database.exec("ALTER TABLE fare_quotes ADD COLUMN internal_notes TEXT NOT NULL DEFAULT ''");
}

function totalCents(items: QuoteCartItem[]): number | null {
  if (items.some((item) => item.unitPrice === null)) return null;
  return Math.round(items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
}

function deserialize(row: QuoteRow): Quote {
  return {
    id: row.id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    customer: JSON.parse(row.customer_snapshot) as QuoteCustomer,
    items: JSON.parse(row.items_snapshot) as QuoteCartItem[],
    status: row.status,
    orderId: row.order_id ?? null,
    totalCents: row.total_cents,
    createdBy: row.created_by ?? null,
    internalNotes: row.internal_notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createQuote(database: DatabaseSync, input: CreateQuoteInput): Quote {
  runQuoteMigrations(database);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO fare_quotes (id, user_id, idempotency_key, customer_snapshot, items_snapshot, status, total_cents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'aguardando_orcamento', ?, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING
  `).run(randomUUID(), input.userId, input.idempotencyKey, JSON.stringify(input.customer), JSON.stringify(input.items), totalCents(input.items), now, now);

  const row = database.prepare("SELECT * FROM fare_quotes WHERE user_id = ? AND idempotency_key = ?")
    .get(input.userId, input.idempotencyKey) as QuoteRow | undefined;
  if (!row) throw new Error("Não foi possível salvar o orçamento.");
  return deserialize(row);
}

export function listQuotesByUser(database: DatabaseSync, userId: string): Quote[] {
  runQuoteMigrations(database);
  const rows = database.prepare("SELECT * FROM fare_quotes WHERE user_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(userId) as unknown as QuoteRow[];
  return rows.map(deserialize);
}

/** Orçamentos de vários donos (conta do site + clientes do painel ligados a ela). */
export function listQuotesByOwners(database: DatabaseSync, ownerIds: string[]): Quote[] {
  runQuoteMigrations(database);
  if (!ownerIds.length) return [];
  const rows = database.prepare(`SELECT * FROM fare_quotes WHERE user_id IN (${ownerIds.map(() => "?").join(", ")}) ORDER BY created_at DESC, rowid DESC`)
    .all(...ownerIds) as unknown as QuoteRow[];
  return rows.map(deserialize);
}

/** Orçamento montado pela equipe no painel (cliente do site ou cadastrado no painel). */
export function createManualQuote(
  database: DatabaseSync,
  input: { ownerId: string; customer: QuoteCustomer; items: QuoteCartItem[]; createdBy: string; internalNotes: string; idempotencyKey: string },
): Quote {
  runQuoteMigrations(database);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO fare_quotes (id, user_id, idempotency_key, customer_snapshot, items_snapshot, status, total_cents, created_by, internal_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'aguardando_orcamento', ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING
  `).run(randomUUID(), input.ownerId, input.idempotencyKey, JSON.stringify(input.customer), JSON.stringify(input.items), totalCents(input.items), input.createdBy, input.internalNotes, now, now);
  const row = database.prepare("SELECT * FROM fare_quotes WHERE user_id = ? AND idempotency_key = ?")
    .get(input.ownerId, input.idempotencyKey) as QuoteRow | undefined;
  if (!row) throw new Error("Não foi possível salvar o orçamento.");
  return deserialize(row);
}

const EDITABLE_STATUSES = ["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"];

/** Equipe edita os itens (e gravações) de um orçamento aberto; recusa se alguém mudou antes. */
export function replaceQuoteItems(
  database: DatabaseSync,
  input: { quoteId: string; items: QuoteCartItem[]; internalNotes: string; expectedUpdatedAt: string },
): Quote {
  runQuoteMigrations(database);
  const current = findQuoteById(database, input.quoteId);
  if (!current) throw new Error(`Orçamento "${input.quoteId}" não encontrado.`);
  if (!EDITABLE_STATUSES.includes(current.status)) throw new Error("Este orçamento não pode mais ser alterado.");
  const total = totalCents(input.items);
  const now = new Date().toISOString();
  const result = database.prepare("UPDATE fare_quotes SET items_snapshot = ?, total_cents = ?, internal_notes = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
    .run(JSON.stringify(input.items), total, input.internalNotes, now, current.id, input.expectedUpdatedAt);
  if (Number(result.changes) !== 1) throw new Error("O orçamento foi alterado por outra pessoa. Abra de novo.");
  return { ...current, items: input.items, totalCents: total, internalNotes: input.internalNotes, updatedAt: now };
}

export function listAllQuotes(database: DatabaseSync): Quote[] {
  runQuoteMigrations(database);
  const rows = database.prepare("SELECT * FROM fare_quotes ORDER BY created_at DESC, rowid DESC").all() as unknown as QuoteRow[];
  return rows.map(deserialize);
}

export function findQuoteById(database: DatabaseSync, id: string): Quote | null {
  runQuoteMigrations(database);
  const row = database.prepare("SELECT * FROM fare_quotes WHERE id = ?").get(id) as QuoteRow | undefined;
  return row ? deserialize(row) : null;
}

/** Muda a situação só se o fluxo permitir e se ninguém mudou antes (evita corrida entre dois atendentes). */
export function updateQuoteStatus(database: DatabaseSync, input: { quoteId: string; nextStatus: QuoteStatus }): Quote {
  const current = findQuoteById(database, input.quoteId);
  if (!current) throw new Error(`Orçamento "${input.quoteId}" não encontrado.`);
  if (!canTransitionQuote(current.status, input.nextStatus)) throw new InvalidQuoteTransitionError(current.status, input.nextStatus);
  // Virar pedido cria o pedido junto (convertQuoteToOrder); nunca só troca a situação.
  if (input.nextStatus === "virou_pedido") throw new InvalidQuoteTransitionError(current.status, input.nextStatus);

  const now = new Date().toISOString();
  const result = database.prepare("UPDATE fare_quotes SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
    .run(input.nextStatus, now, input.quoteId, current.status);
  if (Number(result.changes) !== 1) throw new InvalidQuoteTransitionError(current.status, input.nextStatus);
  return { ...current, status: input.nextStatus, updatedAt: now };
}

/**
 * Equipe forma o preço de um item (quantidade, personalização): troca o item e recalcula o total.
 * Só enquanto o orçamento está aberto.
 */
export function priceQuoteItem(
  database: DatabaseSync,
  input: { quoteId: string; itemIndex: number; quantity: number; unitPrice: number; costing: QuoteCartItem["costing"] },
): Quote {
  runQuoteMigrations(database);
  const current = findQuoteById(database, input.quoteId);
  if (!current) throw new Error(`Orçamento "${input.quoteId}" não encontrado.`);
  if (!["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"].includes(current.status)) {
    throw new Error("Este orçamento não pode mais ser alterado.");
  }
  if (!current.items[input.itemIndex]) throw new Error("Item não encontrado.");
  const items = current.items.map((item, index) => (index === input.itemIndex
    ? { ...item, quantity: input.quantity, quantityRange: undefined, unitPrice: input.unitPrice, costing: input.costing }
    : item));
  const total = totalCents(items);
  const now = new Date().toISOString();
  const result = database.prepare("UPDATE fare_quotes SET items_snapshot = ?, total_cents = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
    .run(JSON.stringify(items), total, now, current.id, current.updatedAt);
  if (Number(result.changes) !== 1) throw new Error("O orçamento foi alterado por outra pessoa. Abra de novo.");
  return { ...current, items, totalCents: total, updatedAt: now };
}

/**
 * Pagamento recebido: o orçamento vira PEDIDO (já em "Aguardando arte") e sai do quadro de orçamentos.
 * Tudo numa transação: ou cria o pedido e marca o orçamento, ou nada muda.
 */
export function convertQuoteToOrder(database: DatabaseSync, input: { quoteId: string; actorId: string }): { quote: Quote; order: Order } {
  runQuoteMigrations(database);
  runOrderMigrations(database);
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = findQuoteById(database, input.quoteId);
    if (!current) throw new Error(`Orçamento "${input.quoteId}" não encontrado.`);
    if (!canTransitionQuote(current.status, "virou_pedido")) throw new InvalidQuoteTransitionError(current.status, "virou_pedido");

    const order = createOrder(
      database,
      {
        userId: current.userId,
        idempotencyKey: `orc:${current.id}`,
        customer: current.customer,
        items: current.items,
        paymentMethod: "pix",
      },
      { initialStatus: "aguardando_arte" },
    );
    const now = new Date().toISOString();
    database.prepare(`
      INSERT INTO fare_order_status_history (id, order_id, previous_status, next_status, actor_id, created_at)
      VALUES (?, ?, 'aguardando_pagamento', 'aguardando_arte', ?, ?)
    `).run(randomUUID(), order.id, input.actorId, now);
    const result = database.prepare("UPDATE fare_quotes SET status = 'virou_pedido', order_id = ?, updated_at = ? WHERE id = ? AND status = ?")
      .run(order.id, now, current.id, current.status);
    if (Number(result.changes) !== 1) throw new InvalidQuoteTransitionError(current.status, "virou_pedido");

    database.exec("COMMIT");
    return { quote: { ...current, status: "virou_pedido", orderId: order.id, updatedAt: now }, order };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
