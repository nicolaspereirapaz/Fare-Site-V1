// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { OrderFinance } from "@/lib/orders/payments";
import type { Order } from "@/lib/orders/repository";
import { buildComanda, renderComandaPdf } from "@/lib/proposals/comanda";

const order: Order = {
  id: "ca7546d8-0000-0000-0000-000000000000", userId: "u1", idempotencyKey: "k", paymentMethod: "pix", status: "aguardando_arte",
  totalCents: 46000, discount: null, createdAt: "2026-10-14T12:00:00.000Z", updatedAt: "2026-10-14T12:00:00.000Z",
  customer: { name: "Ana Souza", phone: "(11) 98888-7777", notes: "Embalar separado" },
  items: [{ id: "a", productName: "Caneta Metal", slug: "removido", quantity: 100, unitPrice: 4.6, selections: { "Variação": "Azul" }, artworkName: null, gravacoes: [{ descricao: "Laser", local: "Corpo" }] }],
};
const finance = (paidCents: number): OrderFinance => ({
  paidCents, balanceCents: 46000 - paidCents, createdBy: "Bia", internalNotes: "", deliveryDate: "2026-10-24", deliveryMode: "retirada",
  installments: null, dueDate: null, payments: [],
});
const noImage = async () => null;

describe("comanda A5", () => {
  it("mostra quanto falta, ou pago, ou pagamento não registrado", async () => {
    expect((await buildComanda(order, finance(20000), noImage)).payment).toEqual({ total: 460, paid: 200, balance: 260, onPickup: false });
    expect((await buildComanda(order, finance(46000), noImage)).payment?.balance).toBe(0);
    expect((await buildComanda(order, null, noImage)).payment).toBeNull();
    expect((await buildComanda(order, { ...finance(0), deliveryTime: "14:30" }, noImage)).delivery?.time).toBe("14:30");
  });

  it("gera um PDF A5 com cliente, entrega e observação", async () => {
    const comanda = await buildComanda(order, finance(0), noImage);
    expect(comanda.delivery).toEqual({ mode: "retirada", date: "2026-10-24", time: null, address: null });
    expect(comanda.notes).toBe("Embalar separado");
    const pdf = await renderComandaPdf(comanda);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 419\.\d+ 595\.\d+\]/);
  }, 30000);
});
