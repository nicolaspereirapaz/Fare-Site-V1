// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { closeSiteOrder, getOrderFinance } from "@/lib/orders/payments";
import { createOrder, findOrderById } from "@/lib/orders/repository";

const items = [{ id: "a", productName: "Revelação 10 × 15", slug: "fotos/10x15-brilho", quantity: 2, selections: {}, artworkName: null, unitPrice: 3 }];
const base = { actorId: "s1", actorName: "Bia", deliveryDate: null, deliveryMode: "retirada" as const, deliveryTime: null, installments: null, dueDate: null };

describe("fechar pedido do site", () => {
  it("registra pagamento e entrega, vai para Pedidos; repetir não duplica; versão velha é recusada", () => {
    const db = new DatabaseSync(":memory:");
    const order = createOrder(db, { userId: "u1", idempotencyKey: "site-1", customer: { name: "Ana" }, items, paymentMethod: "pix" });
    expect(() => closeSiteOrder(db, { ...base, orderId: order.id, expectedUpdatedAt: "velha", paymentMethod: "dinheiro", payment: { amountCents: 600, paidAt: "2026-10-21" } }))
      .toThrow("alterado");
    const closed = closeSiteOrder(db, { ...base, orderId: order.id, expectedUpdatedAt: order.updatedAt, paymentMethod: "dinheiro", payment: { amountCents: 600, paidAt: "2026-10-21" } });
    expect(closed.status).toBe("aguardando_arte");
    expect(closed.paymentMethod).toBe("dinheiro");
    expect(getOrderFinance(db, order.id)).toMatchObject({ paidCents: 600, balanceCents: 0, createdBy: "Bia" });
    closeSiteOrder(db, { ...base, orderId: order.id, expectedUpdatedAt: order.updatedAt, paymentMethod: "dinheiro", payment: { amountCents: 600, paidAt: "2026-10-21" } });
    expect(getOrderFinance(db, order.id)!.payments).toHaveLength(1);
  });

  it("pagar na retirada também libera o pedido; acima do total é recusado", () => {
    const db = new DatabaseSync(":memory:");
    const order = createOrder(db, { userId: "u1", idempotencyKey: "site-2", customer: { name: "Ana" }, items, paymentMethod: "pix" });
    expect(() => closeSiteOrder(db, { ...base, orderId: order.id, expectedUpdatedAt: order.updatedAt, paymentMethod: "pix", payment: { amountCents: 700, paidAt: "2026-10-21" } }))
      .toThrow("acima");
    closeSiteOrder(db, { ...base, orderId: order.id, expectedUpdatedAt: order.updatedAt, paymentMethod: "pix", paymentOnPickup: true, payment: { amountCents: 0, paidAt: null } });
    expect(findOrderById(db, order.id)!.status).toBe("aguardando_arte");
  });
});
