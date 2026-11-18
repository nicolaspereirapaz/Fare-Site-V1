import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { accountQuoteOwners } from "@/lib/customers/repository";
import { runOrderMigrations } from "@/lib/orders/repository";

/**
 * Crédito do cliente: a equipe lança (+) ou retira (−) à mão, com motivo; o pedido usa como desconto
 * (`QuoteDiscount.credit`). Saldo = lançamentos − crédito dos pedidos não cancelados, então cancelar devolve.
 * Donos = os mesmos do histórico do cliente (conta do site inclui os cadastros do painel com o mesmo e-mail).
 */

export type CreditEntry = {
  kind: "lancamento" | "pedido"; amountCents: number; reason: string | null;
  orderId: string | null; actorName: string | null; createdAt: string;
};

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

function migrate(db: DatabaseSync) {
  runOrderMigrations(db);
  db.exec(`CREATE TABLE IF NOT EXISTS fare_customer_credits (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents <> 0),
    reason TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS fare_customer_credits_owner ON fare_customer_credits(owner_id);`);
  // order_id: crédito que veio da diferença de um pedido que diminuiu depois de pago.
  const columns = db.prepare("PRAGMA table_info(fare_customer_credits)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "order_id")) db.exec("ALTER TABLE fare_customer_credits ADD COLUMN order_id TEXT");
}

type CreditRow = { ownerId: string; amountCents: number; reason: string; actorId: string; actorName: string; orderId?: string };
function insertCredit(db: DatabaseSync, input: CreditRow) {
  db.prepare(`INSERT INTO fare_customer_credits (id, owner_id, amount_cents, reason, actor_id, actor_name, created_at, order_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), input.ownerId, input.amountCents, input.reason, input.actorId, input.actorName,
    new Date().toISOString(), input.orderId ?? null);
}

/** Quanto do que foi pago neste pedido já virou crédito do cliente. */
export function orderCreditedCents(db: DatabaseSync, orderId: string): number {
  migrate(db);
  const row = db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM fare_customer_credits WHERE order_id = ?").get(orderId) as { total: number };
  return Number(row.total);
}

/** Pedido ficou menor que o já pago: a diferença vira crédito. Chamar dentro da transação que grava o pedido. */
export function creditOrderExcess(db: DatabaseSync, input: Required<CreditRow>) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Valor do crédito inválido.");
  if (!input.ownerId || !input.orderId || !input.actorId || !input.actorName) throw new Error("Lançamento de crédito inválido.");
  migrate(db);
  insertCredit(db, input);
}

const marks = (owners: string[]) => owners.map(() => "?").join(", ");
// Crédito gravado em reais no JSON do desconto; ROUND evita 80.5 * 100 = 8049.999…
const ORDER_CREDIT = "CAST(ROUND(json_extract(discount_json, '$.credit') * 100) AS INTEGER)";

/** Saldo em centavos. excludeOrderId: o pedido em edição não conta o próprio crédito como gasto. */
export function creditBalanceCents(db: DatabaseSync, ownerId: string, excludeOrderId?: string): number {
  migrate(db);
  const owners = accountQuoteOwners(db, ownerId);
  const added = db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM fare_customer_credits WHERE owner_id IN (${marks(owners)})`)
    .get(...owners) as { total: number };
  const used = db.prepare(`SELECT COALESCE(SUM(${ORDER_CREDIT}), 0) AS total FROM fare_orders
    WHERE user_id IN (${marks(owners)}) AND status <> 'cancelado' AND id <> ? AND json_extract(discount_json, '$.credit') > 0`)
    .get(...owners, excludeOrderId ?? "") as { total: number };
  return Number(added.total) - Number(used.total);
}

/** Saldo e extrato (lançamentos + pedidos não cancelados que usaram crédito), mais novos primeiro. */
export function creditStatement(db: DatabaseSync, ownerId: string): { balanceCents: number; entries: CreditEntry[] } {
  migrate(db);
  const owners = accountQuoteOwners(db, ownerId);
  const manual = db.prepare(`SELECT amount_cents, reason, actor_name, created_at FROM fare_customer_credits WHERE owner_id IN (${marks(owners)})`)
    .all(...owners) as Array<{ amount_cents: number; reason: string; actor_name: string; created_at: string }>;
  const orders = db.prepare(`SELECT id, ${ORDER_CREDIT} AS credit, created_at FROM fare_orders
    WHERE user_id IN (${marks(owners)}) AND status <> 'cancelado' AND json_extract(discount_json, '$.credit') > 0`)
    .all(...owners) as Array<{ id: string; credit: number; created_at: string }>;
  const entries: CreditEntry[] = [
    ...manual.map((row) => ({ kind: "lancamento" as const, amountCents: row.amount_cents, reason: row.reason, orderId: null, actorName: row.actor_name, createdAt: row.created_at })),
    ...orders.map((row) => ({ kind: "pedido" as const, amountCents: -Number(row.credit), reason: null, orderId: row.id, actorName: null, createdAt: row.created_at })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { balanceCents: entries.reduce((sum, entry) => sum + entry.amountCents, 0), entries };
}

/** Recusa usar mais crédito do que o cliente tem. Chamar dentro da transação que grava o pedido. */
export function assertCreditAvailable(db: DatabaseSync, ownerId: string, creditCents: number, excludeOrderId?: string) {
  if (creditCents <= 0) return;
  const balance = creditBalanceCents(db, ownerId, excludeOrderId);
  if (creditCents > balance) throw new Error(`Este cliente tem só ${brl(Math.max(balance, 0))} de crédito.`);
}

/** Lançamento manual da equipe: positivo adiciona, negativo retira (sem deixar o saldo negativo). */
export function addCustomerCredit(db: DatabaseSync, input: {
  ownerId: string; amountCents: number; reason: string; actorId: string; actorName: string;
}): number {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) throw new Error("Valor do crédito inválido.");
  const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
  if (!reason) throw new Error("Escreva o motivo do crédito.");
  if (!input.ownerId || !input.actorId || !input.actorName) throw new Error("Lançamento de crédito inválido.");
  migrate(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    const balance = creditBalanceCents(db, input.ownerId);
    if (balance + input.amountCents < 0) throw new Error(`Este cliente tem só ${brl(Math.max(balance, 0))} de crédito.`);
    insertCredit(db, { ...input, reason });
    db.exec("COMMIT");
    return balance + input.amountCents;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
