import { describe, expect, it } from "vitest";
import { paymentPlan } from "@/lib/orders/paymentPlan";

const pay = (amountCents: number, paymentMethod: "pix" | "dinheiro", paidAt: string) => ({ id: paidAt, amountCents, paymentMethod, paidAt, actorId: "s", actorName: "Bia" });

describe("pagamento em partes", () => {
  it("lista cada recebimento e o que falta, com quando", () => {
    const plan = paymentPlan({ payments: [pay(5000, "pix", "2026-10-21")], balanceCents: 5000, dueDate: null, deliveryMode: "retirada", installments: null });
    expect(plan.receipts).toEqual([{ label: "21/10 · Pix", amount: "R$ 50,00" }]);
    expect(plan.remainder?.label).toBe("Falta pagar · na retirada");
    expect(paymentPlan({ payments: [], balanceCents: 100, dueDate: "2026-11-05", deliveryMode: "entrega", installments: null }).remainder?.label).toBe("Falta pagar · vence 05/11");
    expect(paymentPlan({ payments: [pay(100, "dinheiro", "2026-10-21")], balanceCents: 0, dueDate: null, deliveryMode: "entrega", installments: null }).remainder).toBeNull();
  });
});
