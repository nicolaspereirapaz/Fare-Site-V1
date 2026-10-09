import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { QuoteCartItem, QuoteCustomer } from "@/lib/commerce";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/quoteCode";

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
  totalCents: number | null;
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
  created_at: string;
  updated_at: string;
};

function runQuoteMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_quotes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      customer_snapshot TEXT NOT NULL,
      items_snapshot TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN (${QUOTE_STATUSES.map((s) => `'${s}'`).join(", ")})),
      total_cents INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS fare_quotes_user ON fare_quotes (user_id, created_at);
  `);
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
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createQuote(database: DatabaseSync, input: CreateQuoteInput): Quote {
  runQuoteMigrations(database);
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO fare_quotes (id, user_id, idempotency_key, customer_snapshot, items_snapshot, status, total_cents, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'aguardando_resposta', ?, ?, ?)
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
