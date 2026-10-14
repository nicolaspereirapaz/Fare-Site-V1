import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ORDEM_STATUS_PEDIDO } from "@/lib/backoffice/orderStatus";
import { CHECKOUT_PAYMENT_METHODS, createOrder, findOrderById, listOrderStatusHistory, runOrderMigrations } from "@/lib/orders/repository";
import { createDirectOrder, getOrderFinance, STAFF_PAYMENT_METHODS } from "@/lib/orders/payments";

function legacySchema(db: DatabaseSync, legacyStatus = false) {
  const statuses = legacyStatus ? ["aguardando_pagamento", "pagamento_confirmado"] : [...ORDEM_STATUS_PEDIDO];
  db.exec(`
    CREATE TABLE customers (id TEXT PRIMARY KEY);
    INSERT INTO customers VALUES ('customer-1');
    CREATE TABLE fare_orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES customers(id), idempotency_key TEXT NOT NULL,
      customer_snapshot TEXT NOT NULL, items_snapshot TEXT NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'faturamento_empresa')),
      status TEXT NOT NULL CHECK (status IN (${statuses.map(s => `'${s}'`).join(", ")})),
      total_cents INTEGER CHECK(total_cents >= 0), discount_json TEXT,
      extra_metadata TEXT NOT NULL DEFAULT 'preservar', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(user_id, idempotency_key));
    CREATE INDEX custom_payment_idx ON fare_orders(payment_method);
    CREATE TABLE audit_updates (order_id TEXT);
    CREATE TRIGGER custom_order_audit AFTER UPDATE ON fare_orders BEGIN INSERT INTO audit_updates VALUES (NEW.id); END;
    CREATE TABLE fare_order_status_history (
      ordinal INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL REFERENCES fare_orders(id), previous_status TEXT NOT NULL,
      next_status TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE external_order_link (order_id TEXT REFERENCES fare_orders(id));
  `);
  db.prepare(`INSERT INTO fare_orders
    (id,user_id,idempotency_key,customer_snapshot,items_snapshot,payment_method,status,total_cents,discount_json,created_at,updated_at)
    VALUES ('old','customer-1','old-key','{"name":"Ana"}','[]','pix',?,900,'{"type":"value","value":1}','old-date','old-date')`)
    .run(legacyStatus ? "pagamento_confirmado" : "aguardando_arte");
  db.exec(`INSERT INTO fare_order_status_history (id,order_id,previous_status,next_status,actor_id,created_at)
    VALUES ('history-1','old','aguardando_pagamento','aguardando_arte','staff-old','old-date');
    INSERT INTO external_order_link VALUES ('old');`);
}

const input = {
  userId: "customer-1", idempotencyKey: "new-direct", customer: { name: "Ana", phone: "11999999999" },
  items: [{ id: "photo", productName: "Foto", slug: "foto", quantity: 1, selections: {}, artworkName: null, unitPrice: 10 }],
  paymentMethod: "dinheiro" as const, actorId: "staff", actorName: "Maria", internalNotes: "",
  deliveryDate: null, deliveryMode: "retirada" as const, installments: null, dueDate: null,
  payment: { amountCents: 100, paidAt: "2026-10-14" },
};

describe("migração segura de dinheiro", () => {
  let db: DatabaseSync;
  beforeEach(() => { db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys = ON"); });
  afterEach(() => db.close());

  it.each([false, true])("preserva desconto, histórico, constraints, índices, triggers e FKs (status antigo=%s)", (oldStatus) => {
    legacySchema(db, oldStatus);
    runOrderMigrations(db);
    runOrderMigrations(db);
    expect(findOrderById(db, "old")).toMatchObject({ discount: { type: "value", value: 1 }, totalCents: 900, status: "aguardando_arte", createdAt: "old-date" });
    expect(db.prepare("SELECT extra_metadata FROM fare_orders WHERE id='old'").get()).toMatchObject({ extra_metadata: "preservar" });
    expect(listOrderStatusHistory(db, "old")).toEqual([expect.objectContaining({ id: "history-1", actorId: "staff-old" })]);
    expect(db.prepare("SELECT sql FROM sqlite_schema WHERE name='custom_payment_idx'").get()).toBeDefined();
    expect(db.prepare("SELECT sql FROM sqlite_schema WHERE name='custom_order_audit'").get()).toBeDefined();
    expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => db.exec("UPDATE fare_orders SET total_cents=-1 WHERE id='old'")).toThrow(/CHECK/);
    expect(() => db.exec("UPDATE fare_orders SET user_id='unknown' WHERE id='old'")).toThrow(/FOREIGN KEY/);
    expect(() => db.exec("UPDATE fare_orders SET payment_method='cheque' WHERE id='old'")).toThrow(/CHECK/);
    expect(() => db.exec("UPDATE fare_orders SET status='inventado' WHERE id='old'")).toThrow(/CHECK/);
    db.exec("UPDATE fare_orders SET total_cents=901 WHERE id='old'");
    expect(db.prepare("SELECT count(*) AS n FROM audit_updates").get()).toMatchObject({ n: 1 });
    expect(getOrderFinance(db, "old")).toBeNull();
    expect(createDirectOrder(db, input).paymentMethod).toBe("dinheiro");
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(() => createOrder(db, { ...input, idempotencyKey: "new-direct" })).not.toThrow();
  });

  it("expõe todos os seis métodos só na equipe e mantém checkout sem dinheiro/débito", () => {
    expect(STAFF_PAYMENT_METHODS).toEqual(["pix", "dinheiro", "cartao_debito", "cartao_credito", "boleto", "faturamento_empresa"]);
    expect(CHECKOUT_PAYMENT_METHODS).toEqual(["pix", "cartao_credito", "boleto", "faturamento_empresa"]);
    expect(createDirectOrder(db, input).paymentMethod).toBe("dinheiro");
  });

  it("preserva views e triggers de outras tabelas que referenciam pedidos", () => {
    legacySchema(db);
    db.exec(`CREATE VIEW order_totals AS SELECT id,total_cents FROM fare_orders;
      CREATE TRIGGER external_link_audit AFTER INSERT ON external_order_link BEGIN
        INSERT INTO audit_updates SELECT id FROM fare_orders WHERE id=NEW.order_id; END;`);
    expect(() => runOrderMigrations(db)).not.toThrow();
    expect(db.prepare("SELECT * FROM order_totals").get()).toMatchObject({ id: "old", total_cents: 900 });
    db.exec("INSERT INTO external_order_link VALUES ('old')");
    expect(db.prepare("SELECT count(*) AS n FROM audit_updates").get()).toMatchObject({ n: 1 });
    expect(db.prepare("PRAGMA legacy_alter_table").get()).toMatchObject({ legacy_alter_table: 0 });
  });

  it("migração de histórico legado usa savepoint sem BEGIN aninhado", () => {
    runOrderMigrations(db);
    db.exec(`DROP TABLE fare_order_status_history;
      CREATE TABLE fare_order_status_history (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES fare_orders(id),
        previous_status TEXT NOT NULL, next_status TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL);
      BEGIN IMMEDIATE;`);
    expect(() => runOrderMigrations(db)).not.toThrow();
    expect(db.isTransaction).toBe(true);
    db.exec("ROLLBACK");
  });

  it("rollback de migração inválida mantém schema, desconto, histórico e FKs", () => {
    legacySchema(db);
    db.exec("PRAGMA ignore_check_constraints=ON; UPDATE fare_orders SET status='invalid' WHERE id='old'; PRAGMA ignore_check_constraints=OFF;");
    const before = db.prepare("SELECT sql FROM sqlite_schema WHERE name='fare_orders'").get();
    expect(() => runOrderMigrations(db)).toThrow(/CHECK/);
    expect(db.prepare("SELECT sql FROM sqlite_schema WHERE name='fare_orders'").get()).toEqual(before);
    expect(db.prepare("SELECT discount_json FROM fare_orders WHERE id='old'").get()).toMatchObject({ discount_json: '{"type":"value","value":1}' });
    expect(db.prepare("SELECT count(*) AS n FROM fare_order_status_history").get()).toMatchObject({ n: 1 });
    expect(db.prepare("PRAGMA foreign_keys").get()).toMatchObject({ foreign_keys: 1 });
    expect(db.isTransaction).toBe(false);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name='fare_orders_status_migration'").get()).toBeUndefined();
  });

  it("recusa rebuild com FK ativa dentro de transação sem destruir dados nem transação externa", () => {
    legacySchema(db);
    db.exec("BEGIN IMMEDIATE");
    expect(() => runOrderMigrations(db)).toThrow(/migra.*antes|fora.*transa/i);
    expect(db.isTransaction).toBe(true);
    expect(db.prepare("SELECT discount_json FROM fare_orders WHERE id='old'").get()).toMatchObject({ discount_json: '{"type":"value","value":1}' });
    db.exec("ROLLBACK");
    expect(() => runOrderMigrations(db)).not.toThrow();
  });
});
