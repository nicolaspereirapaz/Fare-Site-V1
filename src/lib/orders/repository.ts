import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { QuoteCartItem, QuoteCustomer } from "@/lib/commerce";
import { applyDiscount, type QuoteDiscount } from "@/lib/quotes/discount";
import {
  ORDEM_STATUS_PEDIDO,
  STATUS_PEDIDO_LEGADO,
  TransicaoStatusPedidoInvalidaError,
  transicionarStatusPedido,
  type StatusPedido,
} from "@/lib/backoffice/orderStatus";

export const PAYMENT_METHODS = [
  "pix",
  "dinheiro",
  "cartao_credito",
  "cartao_debito",
  "boleto",
  "faturamento_empresa",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Formas aceitas em pedidos NOVOS (débito saiu; pedidos antigos continuam válidos). */
export const CHECKOUT_PAYMENT_METHODS: readonly PaymentMethod[] = ["pix", "cartao_credito", "boleto", "faturamento_empresa"];

export type CreateOrderInput = {
  userId: string;
  idempotencyKey: string;
  customer: QuoteCustomer;
  items: QuoteCartItem[];
  paymentMethod: PaymentMethod;
  /** Desconto no total, vindo do orçamento (pedidos do site não têm). */
  discount?: QuoteDiscount | null;
};

/** Pedido nascido de um orçamento já pago: começa direto em "Aguardando arte". */
export type CreateOrderOptions = {
  initialStatus?: StatusPedido;
};

export type Order = Omit<CreateOrderInput, "discount"> & {
  id: string;
  status: StatusPedido;
  totalCents: number | null;
  discount: QuoteDiscount | null;
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
  discount_json?: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderStatusHistoryEntry = {
  id: string;
  orderId: string;
  previousStatus: StatusPedido;
  nextStatus: StatusPedido;
  actorId: string;
  createdAt: string;
};

type OrderStatusHistoryRow = {
  ordinal: number;
  id: string;
  order_id: string;
  previous_status: StatusPedido;
  next_status: StatusPedido;
  actor_id: string;
  created_at: string;
};

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Pedido "${orderId}" não encontrado.`);
    this.name = "OrderNotFoundError";
  }
}

type SqliteSchemaRow = {
  sql: string | null;
};

type SqliteTableInfoRow = {
  name: string;
  type: string;
  pk: number;
};

const ORDER_STATUS_SQL_VALUES = ORDEM_STATUS_PEDIDO
  .map((status) => `'${status.replace(/'/g, "''")}'`)
  .join(", ");

const CREATE_ORDERS_TABLE_SQL = `
  CREATE TABLE fare_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    customer_snapshot TEXT NOT NULL,
    items_snapshot TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'faturamento_empresa')),
    status TEXT NOT NULL CHECK (status IN (${ORDER_STATUS_SQL_VALUES})),
    total_cents INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, idempotency_key)
  )
`;

const CREATE_ORDER_STATUS_HISTORY_TABLE_SQL = `
  CREATE TABLE fare_order_status_history (
    ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    order_id TEXT NOT NULL REFERENCES fare_orders(id),
    previous_status TEXT NOT NULL,
    next_status TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;

/** Converte situações antigas ao migrar a tabela (ex.: pagamento_confirmado → aguardando_arte). */
const LEGACY_STATUS_CASE = `CASE status ${Object.entries(STATUS_PEDIDO_LEGADO)
  .map(([legacy, current]) => `WHEN '${legacy}' THEN '${current}'`)
  .join(" ")} ELSE status END`;

function readPersistedOrderStatuses(database: DatabaseSync): string[] | null {
  const row = database.prepare(`
    SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'fare_orders'
  `).get() as SqliteSchemaRow | undefined;
  const statusCheck = row?.sql?.match(
    /\bstatus\b[^,]*\bCHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)\s*\)/i,
  )?.[1];

  if (!statusCheck) return null;

  return Array.from(statusCheck.matchAll(/'((?:''|[^'])*)'/g), ([, status]) =>
    status.replace(/''/g, "'"),
  );
}

function hasCanonicalOrderStatusConstraint(database: DatabaseSync): boolean {
  const persistedStatuses = readPersistedOrderStatuses(database);
  return persistedStatuses !== null
    && persistedStatuses.length === ORDEM_STATUS_PEDIDO.length
    && persistedStatuses.every((status, index) => status === ORDEM_STATUS_PEDIDO[index]);
}

const PAYMENT_CHECK_PATTERN = /CHECK\s*\(\s*payment_method\s+IN\s*\(([^)]*)\)\s*\)/i;
const STATUS_CHECK_PATTERN = /CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)\s*\)/i;

function hasCanonicalOrderConstraints(database: DatabaseSync): boolean {
  const row = database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='fare_orders'").get() as SqliteSchemaRow;
  const methods = Array.from(row.sql?.match(PAYMENT_CHECK_PATTERN)?.[1].matchAll(/'((?:''|[^'])*)'/g) ?? [], ([, method]) => method);
  return hasCanonicalOrderStatusConstraint(database) && methods.length === PAYMENT_METHODS.length
    && PAYMENT_METHODS.every(method => methods.includes(method));
}

function orderTransaction<T>(database: DatabaseSync, action: () => T): T {
  const nested = database.isTransaction;
  const savepoint = `orders_${randomUUID().replaceAll("-", "")}`;
  database.exec(nested ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
  try {
    const result = action();
    database.exec(nested ? `RELEASE ${savepoint}` : "COMMIT");
    return result;
  } catch (error) {
    database.exec(nested ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK");
    throw error;
  }
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function migrateOrderStatusConstraint(database: DatabaseSync) {
  if (hasCanonicalOrderConstraints(database)) return;
  const foreignKeysEnabled = Number(
    (database.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys,
  ) === 1;
  // SQLite cannot disable FK enforcement inside an existing transaction. Fail before
  // rebuilding instead of cascading/deleting history or nesting BEGIN.
  if (foreignKeysEnabled && database.isTransaction) {
    throw new Error("Execute a migração de pedidos fora da transação, antes dos writes.");
  }
  const legacyAlterTable = Number((database.prepare("PRAGMA legacy_alter_table").get() as { legacy_alter_table: number }).legacy_alter_table);
  if (foreignKeysEnabled) database.exec("PRAGMA foreign_keys = OFF");
  try {
    // The replacement is briefly absent from sqlite_schema. Keep dependent views
    // and external triggers referring to the final name during the rename.
    database.exec("PRAGMA legacy_alter_table = ON");
    orderTransaction(database, () => {
      if (hasCanonicalOrderConstraints(database)) return;
      const original = (database.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name='fare_orders'").get() as { sql: string }).sql;
      const objects = database.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='fare_orders' AND type IN ('index','trigger') AND sql IS NOT NULL")
        .all() as unknown as Array<{ sql: string }>;
      const paymentCheck = `CHECK (payment_method IN (${PAYMENT_METHODS.map(method => `'${method}'`).join(", ")}))`;
      const statusCheck = `CHECK (status IN (${ORDER_STATUS_SQL_VALUES}))`;
      let rebuilt = original.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"fare_orders"|`fare_orders`|\[fare_orders\]|fare_orders)/i,
        "CREATE TABLE fare_orders_status_migration");
      if (rebuilt === original) throw new Error("Schema de pedidos não suportado para migração segura.");
      rebuilt = PAYMENT_CHECK_PATTERN.test(rebuilt) ? rebuilt.replace(PAYMENT_CHECK_PATTERN, paymentCheck)
        : rebuilt.replace(/\bpayment_method\s+TEXT\b/i, `payment_method TEXT ${paymentCheck}`);
      rebuilt = STATUS_CHECK_PATTERN.test(rebuilt) ? rebuilt.replace(STATUS_CHECK_PATTERN, statusCheck)
        : rebuilt.replace(/\bstatus\s+TEXT\b/i, `status TEXT ${statusCheck}`);
      // Preserve every persisted column, including discount_json and custom columns,
      // and let SQLite recreate UNIQUE/CHECK/FK constraints from the original DDL.
      const columns = (database.prepare("PRAGMA table_info(fare_orders)").all() as Array<{ name: string }>).map(column => column.name);
      const names = columns.map(quoteIdentifier).join(", ");
      const values = columns.map(name => name === "status" ? LEGACY_STATUS_CASE : quoteIdentifier(name)).join(", ");
      database.exec(`${rebuilt}; INSERT INTO fare_orders_status_migration (${names}) SELECT ${values} FROM fare_orders;
        DROP TABLE fare_orders;
        ALTER TABLE fare_orders_status_migration RENAME TO fare_orders;`);
      for (const object of objects) database.exec(object.sql);
      if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Falha de integridade referencial na migração de pedidos.");
    });
  } finally {
    database.exec(`PRAGMA legacy_alter_table = ${legacyAlterTable}`);
    if (foreignKeysEnabled) database.exec("PRAGMA foreign_keys = ON");
  }
}

function hasHistoryOrdinal(database: DatabaseSync): boolean {
  const columns = database.prepare(`
    PRAGMA table_info(fare_order_status_history)
  `).all() as unknown as SqliteTableInfoRow[];
  const ordinal = columns.find((column) => column.name === "ordinal");
  return ordinal?.type.toUpperCase() === "INTEGER" && ordinal.pk === 1;
}

function migrateOrderStatusHistory(database: DatabaseSync) {
  if (hasHistoryOrdinal(database)) return;
  orderTransaction(database, () => {
    if (hasHistoryOrdinal(database)) return;
    const objects = database.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name='fare_order_status_history' AND type IN ('index','trigger') AND sql IS NOT NULL")
      .all() as unknown as Array<{ sql: string }>;
    database.exec(`
      ALTER TABLE fare_order_status_history RENAME TO fare_order_status_history_legacy;
      ${CREATE_ORDER_STATUS_HISTORY_TABLE_SQL};
      INSERT INTO fare_order_status_history (
        id, order_id, previous_status, next_status, actor_id, created_at
      )
      SELECT id, order_id, previous_status, next_status, actor_id, created_at
      FROM fare_order_status_history_legacy
      ORDER BY rowid ASC;
      DROP TABLE fare_order_status_history_legacy;
    `);
    for (const object of objects) database.exec(object.sql);
  });
}

export function runOrderMigrations(database: DatabaseSync) {
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec(`
    ${CREATE_ORDERS_TABLE_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")};
  `);
  migrateOrderStatusConstraint(database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS fare_orders_user_created_idx
      ON fare_orders (user_id, created_at DESC);
    ${CREATE_ORDER_STATUS_HISTORY_TABLE_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")};
  `);
  migrateOrderStatusHistory(database);
  const orderColumns = new Set((database.prepare("PRAGMA table_info(fare_orders)").all() as Array<{ name: string }>).map((column) => column.name));
  if (!orderColumns.has("discount_json")) database.exec("ALTER TABLE fare_orders ADD COLUMN discount_json TEXT");
  database.exec(`
    CREATE INDEX IF NOT EXISTS fare_order_status_history_order_idx
      ON fare_order_status_history (order_id, ordinal ASC);
  `);
}

function calculateOrderTotal(items: QuoteCartItem[], discount: QuoteDiscount | null = null): number | null {
  if (items.some((item) => item.unitPrice === null)) return null;
  const subtotal = Math.round(items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100);
  return applyDiscount(subtotal, discount).totalCents;
}

function readDiscount(raw: string | null | undefined): QuoteDiscount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuoteDiscount;
    return (parsed.type === "percent" || parsed.type === "value") && parsed.value > 0 ? parsed : null;
  } catch {
    return null;
  }
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
    discount: readDiscount(row.discount_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createOrder(database: DatabaseSync, input: CreateOrderInput, options: CreateOrderOptions = {}): Order {
  runOrderMigrations(database);
  const initialStatus = options.initialStatus ?? "aguardando_pagamento";
  const id = randomUUID();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO fare_orders (
      id, user_id, idempotency_key, customer_snapshot, items_snapshot,
      payment_method, status, total_cents, discount_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, idempotency_key) DO NOTHING
  `).run(
    id,
    input.userId,
    input.idempotencyKey,
    JSON.stringify(input.customer),
    JSON.stringify(input.items),
    input.paymentMethod,
    initialStatus,
    calculateOrderTotal(input.items, input.discount ?? null),
    input.discount ? JSON.stringify(input.discount) : null,
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

export function listAllOrders(database: DatabaseSync): Order[] {
  runOrderMigrations(database);
  const rows = database.prepare(`
    SELECT * FROM fare_orders ORDER BY created_at DESC, id DESC
  `).all() as unknown as OrderRow[];
  return rows.map(deserializeOrder);
}

export function findOrderById(database: DatabaseSync, id: string): Order | null {
  runOrderMigrations(database);
  const row = database.prepare(`
    SELECT * FROM fare_orders WHERE id = ?
  `).get(id) as OrderRow | undefined;
  return row ? deserializeOrder(row) : null;
}

function deserializeOrderStatusHistoryEntry(row: OrderStatusHistoryRow): OrderStatusHistoryEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    previousStatus: row.previous_status,
    nextStatus: row.next_status,
    actorId: row.actor_id,
    createdAt: row.created_at,
  };
}

export type UpdateOrderStatusInput = {
  orderId: string;
  nextStatus: StatusPedido;
  actorId: string;
};

export function updateOrderStatus(database: DatabaseSync, input: UpdateOrderStatusInput): Order {
  runOrderMigrations(database);
  database.exec("BEGIN IMMEDIATE");

  try {
    const row = database.prepare(`
      SELECT * FROM fare_orders WHERE id = ?
    `).get(input.orderId) as OrderRow | undefined;

    if (!row) throw new OrderNotFoundError(input.orderId);

    const current = deserializeOrder(row);
    transicionarStatusPedido(current.status, input.nextStatus);

    const now = new Date().toISOString();
    const updateResult = database.prepare(`
      UPDATE fare_orders
      SET status = ?, updated_at = ?
      WHERE id = ? AND status = ?
    `).run(input.nextStatus, now, input.orderId, current.status);

    if (Number(updateResult.changes) !== 1) {
      throw new TransicaoStatusPedidoInvalidaError(current.status, input.nextStatus);
    }

    database.prepare(`
      INSERT INTO fare_order_status_history (
        id, order_id, previous_status, next_status, actor_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), input.orderId, current.status, input.nextStatus, input.actorId, now);

    database.exec("COMMIT");
    return { ...current, status: input.nextStatus, updatedAt: now };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function listOrderStatusHistory(database: DatabaseSync, orderId: string): OrderStatusHistoryEntry[] {
  runOrderMigrations(database);
  const rows = database.prepare(`
    SELECT * FROM fare_order_status_history WHERE order_id = ? ORDER BY ordinal ASC
  `).all(orderId) as unknown as OrderStatusHistoryRow[];
  return rows.map(deserializeOrderStatusHistoryEntry);
}
