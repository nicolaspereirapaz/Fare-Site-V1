import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCustomerCredit, creditBalanceCents, creditStatement } from "@/lib/customers/credit";
import { createDirectOrder, replaceOrderItems, type DirectOrderInput } from "@/lib/orders/payments";
import { findOrderById, updateOrderStatus } from "@/lib/orders/repository";

const owner = "painel:cliente-1";
const staff = { actorId: "staff-1", actorName: "Ana" };
const item = { id: "i1", productName: "Caneca", slug: "avulso:i1", quantity: 10, selections: {}, artworkName: null, unitPrice: 20 };
const order = (key: string, credit: number, paid = 0): DirectOrderInput => ({
  userId: owner, idempotencyKey: key, customer: { name: "Cliente", phone: "11999999999" },
  items: [item], discount: { type: "value", value: 0, credit }, paymentMethod: "pix",
  ...staff, internalNotes: "", deliveryDate: null, deliveryMode: "retirada", installments: null, dueDate: null,
  payment: { amountCents: paid, paidAt: paid ? "2026-11-16" : null },
});

describe("crédito do cliente", () => {
  let db: DatabaseSync;
  beforeEach(() => { db = new DatabaseSync(":memory:"); });
  afterEach(() => db.close());

  it("lança e retira à mão, com motivo, sem deixar o saldo negativo", () => {
    expect(addCustomerCredit(db, { ownerId: owner, amountCents: 10000, reason: "Pagou a mais", ...staff })).toBe(10000);
    expect(() => addCustomerCredit(db, { ownerId: owner, amountCents: -15000, reason: "Erro", ...staff })).toThrow("Este cliente tem só R$ 100,00 de crédito.");
    expect(() => addCustomerCredit(db, { ownerId: owner, amountCents: 500, reason: "  ", ...staff })).toThrow(/motivo/);
    expect(() => addCustomerCredit(db, { ownerId: owner, amountCents: 0, reason: "x", ...staff })).toThrow(/inválido/);
    expect(addCustomerCredit(db, { ownerId: owner, amountCents: -2500, reason: "Ajuste", ...staff })).toBe(7500);
    expect(creditBalanceCents(db, owner)).toBe(7500);
    expect(creditBalanceCents(db, "painel:outro")).toBe(0);
  });

  it("o pedido gasta o crédito, não deixa usar duas vezes e cancelar devolve", () => {
    addCustomerCredit(db, { ownerId: owner, amountCents: 10000, reason: "Troca", ...staff });
    const first = createDirectOrder(db, order("p1", 80, 5000));
    expect(first.totalCents).toBe(12000);
    expect(creditBalanceCents(db, owner)).toBe(2000);
    expect(() => createDirectOrder(db, order("p2", 30, 5000))).toThrow("Este cliente tem só R$ 20,00 de crédito.");

    const statement = creditStatement(db, owner);
    expect(statement.balanceCents).toBe(2000);
    expect(statement.entries.map((entry) => [entry.kind, entry.amountCents])).toEqual([["pedido", -8000], ["lancamento", 10000]]);
    expect(statement.entries[0].orderId).toBe(first.id);

    updateOrderStatus(db, { orderId: first.id, nextStatus: "cancelado", actorId: "staff-1" });
    expect(creditBalanceCents(db, owner)).toBe(10000);
  });

  it("editar o pedido não conta o próprio crédito como gasto", () => {
    addCustomerCredit(db, { ownerId: owner, amountCents: 8000, reason: "Troca", ...staff });
    const created = createDirectOrder(db, order("p1", 80, 5000));
    const edited = replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: created.updatedAt, items: [{ ...item, quantity: 12 }] });
    expect(edited.totalCents).toBe(16000);
    expect(() => replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: edited.updatedAt, items: [item], discount: { type: "value", value: 0, credit: 90 } }))
      .toThrow("Este cliente tem só R$ 80,00 de crédito.");
  });

  it("pedido pago todo com crédito vai direto para a arte", () => {
    addCustomerCredit(db, { ownerId: owner, amountCents: 20000, reason: "Cortesia", ...staff });
    const created = createDirectOrder(db, order("p1", 200));
    expect(findOrderById(db, created.id)!).toMatchObject({ totalCents: 0, status: "aguardando_arte" });
    expect(creditBalanceCents(db, owner)).toBe(0);
  });
});
