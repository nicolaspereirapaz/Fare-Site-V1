// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { QuoteCartItem } from "@/lib/commerce";
import { createDirectOrder, getOrderFinance, replaceOrderItems } from "@/lib/orders/payments";
import { findOrderById } from "@/lib/orders/repository";
import { creditBalanceCents } from "@/lib/customers/credit";
import { paymentPlan } from "@/lib/orders/paymentPlan";

const item = (id: string, productName: string, quantity: number, unitPrice: number): QuoteCartItem => ({
  id, productName, slug: `avulso:${id}`, quantity, selections: {}, artworkName: null, unitPrice,
});
const customer = { name: "Cliente Teste", phone: "(11) 97777-6666" };
const order = (db: DatabaseSync, key: string, paidCents: number) => createDirectOrder(db, {
  userId: "painel:x", customer, items: [item("a", "Caneca", 10, 20)], paymentMethod: "pix", actorId: "s", actorName: "Equipe",
  internalNotes: "antes", idempotencyKey: key, discount: null, deliveryMode: "retirada", deliveryDate: null, installments: null, dueDate: null,
  payment: { amountCents: paidCents, paidAt: paidCents ? "2026-10-19" : null },
});

describe("editar pedido", () => {
  it("troca itens, desconto e observação; pagamentos ficam como estavam", () => {
    const db = new DatabaseSync(":memory:");
    const created = order(db, "edit-1", 5000);
    const updated = replaceOrderItems(db, {
      orderId: created.id, expectedUpdatedAt: created.updatedAt, internalNotes: "depois", discount: { type: "value", value: 10 },
      items: [item("a", "Caneca", 10, 20), item("f", "Revelação 10 × 15 cm", 30, 3)],
    });
    expect(updated.items).toHaveLength(2);
    expect(updated.totalCents).toBe(28000); // 200 + 90 − 10
    const finance = getOrderFinance(db, created.id)!;
    expect(finance).toMatchObject({ paidCents: 5000, internalNotes: "depois", balanceCents: 23000 });
  });

  it("recusa total menor que o já recebido, edição de outra pessoa e pedido concluído", () => {
    const db = new DatabaseSync(":memory:");
    const created = order(db, "edit-2", 15000);
    expect(() => replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: created.updatedAt, items: [item("a", "Caneca", 5, 20)] }))
      .toThrow(/menor que o valor já recebido/);
    expect(() => replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: "2000-01-01T00:00:00.000Z", items: [item("a", "Caneca", 10, 20)] }))
      .toThrow(/outra pessoa/);
    expect(findOrderById(db, created.id)!.totalCents).toBe(20000);
    db.prepare("UPDATE fare_orders SET status = 'concluido' WHERE id = ?").run(created.id);
    expect(() => replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: created.updatedAt, items: [item("a", "Caneca", 20, 20)] }))
      .toThrow(/não pode mais ser alterado/);
  });

  it("diminuir depois de pago: a diferença vira crédito do cliente; aumentar: o cliente paga na retirada", () => {
    const db = new DatabaseSync(":memory:");
    const created = order(db, "edit-3", 20000);
    const actor = { actorId: "s", actorName: "Equipe" };
    const smaller = replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: created.updatedAt, items: [item("a", "Caneca", 7, 20)], creditExcess: actor });
    expect(creditBalanceCents(db, created.userId)).toBe(6000);
    expect(getOrderFinance(db, created.id)).toMatchObject({ paidCents: 14000, balanceCents: 0, creditedCents: 6000 });
    expect(paymentPlan(getOrderFinance(db, created.id)!).receipts.at(-1)).toMatchObject({ label: "Virou crédito do cliente" });
    // Diminuir de novo: só a nova diferença vira crédito.
    const again = replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: smaller.updatedAt, items: [item("a", "Caneca", 5, 20)], creditExcess: actor });
    expect(creditBalanceCents(db, created.userId)).toBe(10000);
    // Aumentar: o que passou do pago fica como saldo, cobrado na retirada.
    replaceOrderItems(db, { orderId: created.id, expectedUpdatedAt: again.updatedAt, items: [item("a", "Caneca", 8, 20)] });
    const finance = getOrderFinance(db, created.id)!;
    expect(finance).toMatchObject({ paidCents: 10000, balanceCents: 6000 });
    expect(paymentPlan(finance).remainder).toMatchObject({ label: "Falta pagar · na retirada" });
    expect(creditBalanceCents(db, created.userId)).toBe(10000);
  });
});
