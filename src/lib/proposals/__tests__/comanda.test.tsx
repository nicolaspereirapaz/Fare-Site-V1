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
    expect((await buildComanda(order, finance(20000), noImage)).payment).toMatchObject({ total: 460, paid: 200, balance: 260, onPickup: false });
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

  it("entrega mostra o endereço digitado; foto mostra tamanho e papel", async () => {
    const photoOrder: Order = {
      ...order,
      customer: { ...order.customer, address: "Rua das Flores, 12 — Centro, Jundiaí" },
      items: [{ id: "f", productName: "Revelação 10 × 15 cm · papel Fosco", slug: "avulso:1", quantity: 30, unitPrice: 1.5, selections: {}, artworkName: null }],
    };
    const comanda = await buildComanda(photoOrder, { ...finance(0), deliveryMode: "entrega" }, noImage);
    expect(comanda.delivery?.address).toBe("Rua das Flores, 12 — Centro, Jundiaí");
    expect(comanda.doc.items[0]).toMatchObject({ specs: ["10x15cm", expect.any(String)], color: "Papel Fosco" });
    expect((await buildComanda(photoOrder, finance(0), noImage)).delivery?.address).toBeNull(); // retirada: sem endereço
    // Endereço digitado no pedido vale no lugar do cadastro.
    const own = await buildComanda(photoOrder, { ...finance(0), deliveryMode: "entrega", deliveryAddress: { cep: "", street: "Av. B", number: "5", complement: "", district: "", city: "Itu", state: "SP", reference: "" } }, noImage);
    expect(own.delivery?.address).toBe("Av. B, 5 — Itu/SP");
    await expect(renderComandaPdf(comanda)).resolves.toBeInstanceOf(Buffer);
  }, 30000);
});
