// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { documentNumberOf } from "@/lib/documentNumber";
import { createOrder } from "@/lib/orders/repository";
import { orderCode } from "@/lib/orders/orderCode";
import { createQuote, findQuoteById } from "@/lib/quotes/repository";
import { quoteCode } from "@/lib/quotes/quoteCode";

const customer = { name: "Ana Silva", phone: "11999999999" };
const items = [{ id: "a", productName: "Caneta", slug: "brindes/x", quantity: 10, selections: {}, artworkName: null, unitPrice: 2 }];

describe("numeração ORC/PED", () => {
  it("ORC-0001 reserva o PED-0001; pedido avulso pega o próximo livre; repetição não gasta número", () => {
    const db = new DatabaseSync(":memory:");
    const q1 = createQuote(db, { userId: "u1", idempotencyKey: "k1", customer, items });
    const q2 = createQuote(db, { userId: "u1", idempotencyKey: "k2", customer, items });
    expect([quoteCode(q1.id), quoteCode(q2.id)]).toEqual(["ORC-0001", "ORC-0002"]);

    const avulso = createOrder(db, { userId: "u2", idempotencyKey: "site-1", customer, items, paymentMethod: "pix" });
    expect(orderCode(avulso.id)).toBe("PED-0003");
    expect(createOrder(db, { userId: "u2", idempotencyKey: "site-1", customer, items, paymentMethod: "pix" }).id).toBe(avulso.id);

    // Fechar o ORC-0002 vira o PED-0002, mesmo depois de outros pedidos.
    const fromQuote = createOrder(db, { userId: "u1", idempotencyKey: `orc:${findQuoteById(db, q2.id)!.id}`, customer, items, paymentMethod: "pix" });
    expect(orderCode(fromQuote.id)).toBe("PED-0002");
    expect(orderCode(createOrder(db, { userId: "u3", idempotencyKey: "site-2", customer, items, paymentMethod: "pix" }).id)).toBe("PED-0004");
  });

  it("id antigo (uuid) continua com o código antigo, mesmo começando com algarismos", () => {
    expect(documentNumberOf("12345678-abcd-4abc-8abc-123456789abc")).toBeNull();
    expect(quoteCode("12345678-abcd-4abc-8abc-123456789abc")).toBe("ORC-123456");
    expect(orderCode("0042-12345678-abcd-4abc-8abc-123456789abc")).toBe("PED-0042");
  });
});
