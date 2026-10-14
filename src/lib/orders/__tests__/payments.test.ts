import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as payments from "@/lib/orders/payments";
import { createOrder, findOrderById, listOrderStatusHistory, runOrderMigrations } from "@/lib/orders/repository";
import type { DirectOrderInput } from "@/lib/orders/payments";

const baseInput: DirectOrderInput = {
  userId: "customer-1", idempotencyKey: "direct-1",
  customer: { name: "Ana", phone: "11999999999" },
  items: [{ id: "item-1", productName: "Foto", slug: "foto", quantity: 2,
    selections: {}, artworkName: null, unitPrice: 10 }],
  discount: { type: "percent", value: 10 }, paymentMethod: "pix",
  actorId: "staff-1", actorName: "Maria", internalNotes: "Conferir arte",
  deliveryDate: "2026-10-30", deliveryMode: "retirada", installments: null, dueDate: null,
  payment: { amountCents: 500, paidAt: "2026-10-14" },
};

describe("financeiro de pedido direto", () => {
  let db: DatabaseSync;
  beforeEach(() => { db = new DatabaseSync(":memory:"); });
  afterEach(() => db.close());

  it.each([
    ["centavos negativos", { payment: { amountCents: -1, paidAt: "2026-10-14" } }],
    ["centavos fracionários", { payment: { amountCents: 0.5, paidAt: "2026-10-14" } }],
    ["centavos inseguros", { payment: { amountCents: Number.MAX_SAFE_INTEGER + 1, paidAt: "2026-10-14" } }],
    ["centavos texto", { payment: { amountCents: "500", paidAt: "2026-10-14" } }],
    ["pagamento acima total", { payment: { amountCents: 1801, paidAt: "2026-10-14" } }],
    ["sem data efetiva", { payment: { amountCents: 500, paidAt: null } }],
    ["data inexistente", { payment: { amountCents: 500, paidAt: "2026-02-29" } }],
    ["data com hora", { payment: { amountCents: 500, paidAt: "2026-10-14T00:00:00Z" } }],
    ["entrega inexistente", { deliveryDate: "2026-04-31" }],
    ["entrega formato", { deliveryDate: "14/10/2026" }],
    ["vencimento inválido", { paymentMethod: "boleto", dueDate: "2026-13-01" }],
    ["vencimento indevido", { dueDate: "2026-10-30" }],
    ["parcela indevida", { installments: 2 }],
    ["parcela zero", { paymentMethod: "cartao_credito", installments: 0 }],
    ["parcela 13", { paymentMethod: "cartao_credito", installments: 13 }],
    ["parcela fracionária", { paymentMethod: "cartao_credito", installments: 1.5 }],
    ["modalidade inválida", { deliveryMode: "correio" }],
    ["método inválido", { paymentMethod: "cheque" }],
    ["ator vazio", { actorId: " " }],
    ["nome ator vazio", { actorName: "" }],
    ["notas não string", { internalNotes: 123 }],
    ["cliente vazio", { userId: "" }],
    ["chave vazia", { idempotencyKey: "" }],
    ["preço desconhecido", { items: [{ ...baseInput.items[0], unitPrice: null }] }],
    ["preço negativo", { items: [{ ...baseInput.items[0], unitPrice: -10 }] }],
    ["total inseguro", { items: [{ ...baseInput.items[0], unitPrice: Number.MAX_SAFE_INTEGER }] }],
    ["quantidade inválida", { items: [{ ...baseInput.items[0], quantity: 0 }] }],
    ["itens vazios", { items: [] }],
    ["desconto negativo", { discount: { type: "value", value: -1 } }],
  ])("rejeita criação inválida: %s sem gravar pedido", (_name, patch) => {
    runOrderMigrations(db);
    expect(() => payments.createDirectOrder(db, { ...baseInput, ...patch } as DirectOrderInput)).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM fare_orders").get()).toMatchObject({ n: 0 });
  });

  it.each([
    ["zero", { amountCents: 0 }], ["negativo", { amountCents: -1 }], ["fracionário", { amountCents: 1.5 }],
    ["inseguro", { amountCents: Number.MAX_SAFE_INTEGER + 1 }], ["acima saldo", { amountCents: 1301 }],
    ["data inválida", { paidAt: "2026-02-30" }], ["ator vazio", { actorId: "" }],
    ["nome vazio", { actorName: "" }], ["chave vazia", { idempotencyKey: "" }],
    ["método inválido", { paymentMethod: "cheque" }],
  ])("rejeita recebimento inválido: %s sem alterar financeiro", (_name, patch) => {
    const order = payments.createDirectOrder(db, baseInput);
    const before = payments.getOrderFinance(db, order.id);
    const input = { orderId: order.id, idempotencyKey: "receipt", amountCents: 100, paymentMethod: "pix",
      paidAt: "2026-10-14", actorId: "staff", actorName: "Maria", ...patch };
    expect(() => payments.recordOrderPayment(db, input as Parameters<typeof payments.recordOrderPayment>[1])).toThrow();
    expect(payments.getOrderFinance(db, order.id)).toEqual(before);
  });

  it.each(["cancelado", "concluido"])("bloqueia novo recebimento em pedido %s", (status) => {
    const order = payments.createDirectOrder(db, baseInput);
    db.prepare("UPDATE fare_orders SET status = ? WHERE id = ?").run(status, order.id);
    expect(() => payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "new", amountCents: 100,
      paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" })).toThrow(/cancelado|concluído/i);
    expect(payments.getOrderFinance(db, order.id)?.paidCents).toBe(500);
  });

  it.each(["fare_order_finance", "fare_order_payments", "fare_order_status_history"])("criação reverte writes ignorados por trigger em %s", (table) => {
    payments.getOrderFinance(db, "missing");
    db.exec(`CREATE TRIGGER ignore_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END;`);
    expect(() => payments.createDirectOrder(db, table === "fare_order_finance" ? { ...baseInput, payment: { amountCents: 0, paidAt: null } } : baseInput)).toThrow();
    expect(db.prepare("SELECT count(*) AS n FROM fare_orders").get()).toMatchObject({ n: 0 });
  });

  it.each(["fare_order_payments", "fare_order_status_history"])("recebimento reverte writes ignorados por trigger em %s", (table) => {
    const order = payments.createDirectOrder(db, { ...baseInput, payment: { amountCents: 0, paidAt: null } });
    db.exec(`CREATE TRIGGER ignore_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END;`);
    expect(() => payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "fail", amountCents: 100,
      paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" })).toThrow();
    expect(payments.getOrderFinance(db, order.id)?.paidCents).toBe(0);
    expect(findOrderById(db, order.id)?.status).toBe("aguardando_pagamento");
    expect(listOrderStatusHistory(db, order.id)).toHaveLength(1);
  });

  it("chave do recebimento não colide com chave interna do pagamento inicial", () => {
    const order = payments.createDirectOrder(db, baseInput);
    const finance = payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "initial", amountCents: 100,
      paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" });
    expect(finance.paidCents).toBe(600);
    expect(finance.payments).toHaveLength(2);
  });

  it.each(["pix", "dinheiro", "cartao_debito", "cartao_credito", "boleto", "faturamento_empresa"] as const)("%s registra apenas valor efetivo informado", (paymentMethod) => {
    const order = payments.createDirectOrder(db, { ...baseInput, paymentMethod,
      installments: paymentMethod === "cartao_credito" ? 12 : null,
      dueDate: paymentMethod === "boleto" || paymentMethod === "faturamento_empresa" ? "2028-02-29" : null,
      deliveryDate: "2028-02-29", payment: { amountCents: 1800, paidAt: "2028-02-29" } });
    expect(payments.getOrderFinance(db, order.id)).toMatchObject({ paidCents: 1800, balanceCents: 0,
      payments: [expect.objectContaining({ paymentMethod, paidAt: "2028-02-29" })] });
  });

  it("mesma chave de criação pertence ao cliente e recebimento pertence ao pedido", () => {
    const one = payments.createDirectOrder(db, baseInput);
    const two = payments.createDirectOrder(db, { ...baseInput, userId: "customer-2" });
    for (const order of [one, two]) {
      expect(payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "same", amountCents: 100,
        paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" }).paidCents).toBe(600);
    }
    expect(one.id).not.toBe(two.id);
  });

  it("faz rollback do ledger quando o UPDATE de status é ignorado", () => {
    const order = payments.createDirectOrder(db, { ...baseInput, payment: { amountCents: 0, paidAt: null } });
    db.exec(`CREATE TRIGGER ignore_status BEFORE UPDATE OF status ON fare_orders BEGIN SELECT RAISE(IGNORE); END;`);
    expect(() => payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "fail", amountCents: 100,
      paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" })).toThrow();
    expect(payments.getOrderFinance(db, order.id)).toMatchObject({ paidCents: 0, payments: [] });
    expect(findOrderById(db, order.id)?.status).toBe("aguardando_pagamento");
    expect(listOrderStatusHistory(db, order.id)).toHaveLength(1);
  });

  it.each(["fare_order_finance", "fare_order_payments", "fare_order_status_history"])("criação é atômica se escrita em %s falhar", (table) => {
    payments.getOrderFinance(db, "missing");
    db.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(FAIL, 'falha induzida'); END;`);
    expect(() => payments.createDirectOrder(db, baseInput)).toThrow("falha induzida");
    for (const name of ["fare_orders", "fare_order_finance", "fare_order_payments", "fare_order_status_history"]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${name}`).get()).toMatchObject({ n: 0 });
    }
  });

  it("recebimento faz rollback de ledger e status se auditoria falhar", () => {
    const order = payments.createDirectOrder(db, { ...baseInput, payment: { amountCents: 0, paidAt: null } });
    const before = payments.getOrderFinance(db, order.id);
    db.exec(`CREATE TRIGGER fail_history BEFORE INSERT ON fare_order_status_history BEGIN SELECT RAISE(FAIL, 'falha de histórico'); END;`);
    expect(() => payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "fail", amountCents: 100,
      paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" })).toThrow("falha de histórico");
    expect(payments.getOrderFinance(db, order.id)).toEqual(before);
    expect(findOrderById(db, order.id)?.status).toBe("aguardando_pagamento");
    expect(listOrderStatusHistory(db, order.id)).toHaveLength(1);
  });

  it("savepoints preservam transação externa e seu rollback desfaz criação/recebimento", () => {
    runOrderMigrations(db);
    db.exec("BEGIN IMMEDIATE; CREATE TABLE outer_work (id TEXT); INSERT INTO outer_work VALUES ('outer');");
    const order = payments.createDirectOrder(db, baseInput);
    payments.recordOrderPayment(db, { orderId: order.id, idempotencyKey: "nested", amountCents: 100,
      paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff", actorName: "Maria" });
    expect(db.isTransaction).toBe(true);
    expect(payments.getOrderFinance(db, order.id)?.paidCents).toBe(600);
    expect(() => payments.createDirectOrder(db, { ...baseInput, idempotencyKey: "invalid", payment: { amountCents: 9999, paidAt: "2026-10-14" } })).toThrow();
    expect(db.isTransaction).toBe(true);
    expect(db.prepare("SELECT count(*) AS n FROM outer_work").get()).toMatchObject({ n: 1 });
    db.exec("ROLLBACK");
    expect(findOrderById(db, order.id)).toBeNull();
    expect(payments.getOrderFinance(db, order.id)).toBeNull();
  });

  it("registra primeiro recebimento com transição e repetição imutável por chave", () => {
    const order = payments.createDirectOrder(db, { ...baseInput, payment: { amountCents: 0, paidAt: null } });
    const input = { orderId: order.id, idempotencyKey: "receipt-1", amountCents: 300, paymentMethod: "pix" as const,
      paidAt: "2026-10-15", actorId: "staff-2", actorName: "João" };
    const first = payments.recordOrderPayment(db, input);
    expect(first).toMatchObject({ paidCents: 300, balanceCents: 1500,
      payments: [expect.objectContaining({ amountCents: 300, actorId: "staff-2", actorName: "João", paidAt: "2026-10-15" })] });
    expect(findOrderById(db, order.id)?.status).toBe("aguardando_arte");
    expect(listOrderStatusHistory(db, order.id)).toHaveLength(2);
    expect(listOrderStatusHistory(db, order.id)[1]).toMatchObject({ previousStatus: "aguardando_pagamento", nextStatus: "aguardando_arte", actorId: "staff-2" });
    expect(payments.recordOrderPayment(db, { ...input, amountCents: 1800, actorName: "Alterado" })).toEqual(first);
    db.prepare("UPDATE fare_orders SET status = 'em_producao' WHERE id = ?").run(order.id);
    const second = payments.recordOrderPayment(db, { ...input, idempotencyKey: "receipt-2", amountCents: 1500 });
    expect(second).toMatchObject({ paidCents: 1800, balanceCents: 0 });
    expect(second.payments).toHaveLength(2);
    expect(findOrderById(db, order.id)?.status).toBe("em_producao");
    expect(listOrderStatusHistory(db, order.id)).toHaveLength(2);
  });

  it("repete criação sem duplicar ou alterar snapshots, metadados, ledger e histórico", () => {
    const first = payments.createDirectOrder(db, baseInput);
    const originalFinance = payments.getOrderFinance(db, first.id);
    const repeated = payments.createDirectOrder(db, { ...baseInput, actorId: "other", internalNotes: "Alterado",
      payment: { amountCents: 1000, paidAt: "2026-10-15" }, items: [{ ...baseInput.items[0], unitPrice: 50 }] });
    expect(repeated).toEqual(first);
    expect(payments.getOrderFinance(db, first.id)).toEqual(originalFinance);
    expect(listOrderStatusHistory(db, first.id)).toHaveLength(1);
    expect(db.prepare("SELECT count(*) AS n FROM fare_orders").get()).toMatchObject({ n: 1 });
  });

  it("não atribui financeiro nem recebimentos ao legado, inclusive colisão de chave", () => {
    const legacy = createOrder(db, baseInput, { initialStatus: "aguardando_arte" });
    expect(payments.getOrderFinance(db, legacy.id)).toBeNull();
    expect(payments.getOrderFinance(db, "missing")).toBeNull();
    expect(() => payments.createDirectOrder(db, baseInput)).toThrow(/legado|financeiro/i);
    expect(payments.getOrderFinance(db, legacy.id)).toBeNull();
  });

  it("valor zero não cria ledger nem presume recebimento por boleto emitido ou vencimento", () => {
    const order = payments.createDirectOrder(db, { ...baseInput, paymentMethod: "boleto", dueDate: "2026-11-01",
      payment: { amountCents: 0, paidAt: null } });
    expect(order.status).toBe("aguardando_pagamento");
    expect(payments.getOrderFinance(db, order.id)).toMatchObject({ paidCents: 0, balanceCents: 1800, payments: [] });
    expect(listOrderStatusHistory(db, order.id)).toEqual([expect.objectContaining({ actorId: "staff-1", nextStatus: "aguardando_pagamento" })]);
  });

  it("cria pedido descontado, recebimento efetivo e origem da equipe no histórico", () => {
    const order = payments.createDirectOrder(db, baseInput);
    expect(order).toMatchObject({ totalCents: 1800, discount: baseInput.discount, status: "aguardando_arte" });
    expect(payments.getOrderFinance(db, order.id)).toMatchObject({
      paidCents: 500, balanceCents: 1300, createdBy: "Maria", internalNotes: "Conferir arte",
      deliveryDate: "2026-10-30", deliveryMode: "retirada", installments: null, dueDate: null,
      payments: [{ amountCents: 500, paymentMethod: "pix", paidAt: "2026-10-14", actorId: "staff-1", actorName: "Maria" }],
    });
    expect(listOrderStatusHistory(db, order.id)).toEqual([expect.objectContaining({ actorId: "staff-1", nextStatus: "aguardando_arte" })]);
  });
});
