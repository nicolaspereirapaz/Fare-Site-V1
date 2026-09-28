import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { QuoteCartItem, QuoteCustomer } from "@/lib/commerce";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";

export const PAYMENT_METHODS = [
  "pix",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "faturamento_empresa",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CreateOrderInput = {
  userId: string;
  idempotencyKey: string;
  customer: QuoteCustomer;
  items: QuoteCartItem[];
  paymentMethod: PaymentMethod;
};

export type Order = CreateOrderInput & {
  id: string;
  status: StatusPedido;
  totalCents: number | null;
  createdAt: string;
  updatedAt: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  customer_snapshot: string;
  items_snapshot: string;
  payment_method: PaymentMethod;
  status: StatusPedido;
  total_cents: number | null;
  created_at: string;
  updated_at: string;
};

export function runOrderMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS fare_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      customer_snapshot TEXT NOT NULL,
      items_snapshot TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'faturamento_empresa')),
      status TEXT NOT NULL CHECK (status IN ('aguardando_pagamento', 'pagamento_confirmado', 'aguardando_personalizacao', 'personalizacao_em_aprovacao', 'personalizacao_aprovada', 'em_producao', 'pronto_para_envio', 'em_transporte_ou_retirada', 'concluido', 'cancelado')),
      total_cents INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS fare_orders_user_created_idx
      ON fare_orders (user_id, created_at DESC);
  `);
}

function calculateOrderTotal(items: QuoteCartItem[]): number | null {
  if (items.some((item) => item.unitPrice === null)) return null;
  return Math.round(items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
}

function deserializeOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    customer: JSON.parse(row.customer_snapshot) as QuoteCustomer,
    items: JSON.parse(row.items_snapshot) as QuoteCartItem[],
    paymentMethod: row.payment_method,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOrder(database: DatabaseSync, input: CreateOrderInput): Order {
  runOrderMigrations(database);
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO fare_orders (
      id, user_id, idempotency_key, customer_snapshot, items_snapshot,
      payment_method, status, total_cents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'aguardando_pagamento', ?, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING
  `).run(
    id,
    input.userId,
    input.idempotencyKey,
    JSON.stringify(input.customer),
    JSON.stringify(input.items),
    input.paymentMethod,
    calculateOrderTotal(input.items),
    now,
    now,
  );

  const row = database.prepare(`
    SELECT * FROM fare_orders WHERE user_id = ? AND idempotency_key = ?
  `).get(input.userId, input.idempotencyKey) as OrderRow | undefined;

  if (!row) throw new Error("Não foi possível persistir o pedido.");
  return deserializeOrder(row);
}

export function listOrdersByUser(database: DatabaseSync, userId: string): Order[] {
  runOrderMigrations(database);
  const rows = database.prepare(`
    SELECT * FROM fare_orders WHERE user_id = ? ORDER BY created_at DESC, id DESC
  `).all(userId) as unknown as OrderRow[];
  return rows.map(deserializeOrder);
}
