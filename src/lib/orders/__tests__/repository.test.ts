import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrder,
  listOrdersByUser,
  runOrderMigrations,
  type CreateOrderInput,
} from "@/lib/orders/repository";

const baseInput: CreateOrderInput = {
  userId: "user-1",
  idempotencyKey: "checkout-abc-123",
  customer: { name: "Ana", phone: "11999999999" },
  paymentMethod: "pix",
  items: [{
    id: "item-1",
    productName: "Foto 10x15",
    slug: "foto-10x15",
    quantity: 2,
    selections: { Papel: "Fosco" },
    artworkName: null,
    unitPrice: 2.5,
  }],
};

describe("repositório de pedidos", () => {
  let database: DatabaseSync;

  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    runOrderMigrations(database);
  });

  afterEach(() => database.close());

  it("migra de forma idempotente e persiste snapshot, pagamento, status e total", () => {
    expect(() => runOrderMigrations(database)).not.toThrow();

    const order = createOrder(database, baseInput);

    expect(order).toMatchObject({
      userId: "user-1",
      idempotencyKey: "checkout-abc-123",
      paymentMethod: "pix",
      status: "aguardando_pagamento",
      totalCents: 500,
      customer: baseInput.customer,
      items: baseInput.items,
    });
    expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("mantém total nulo quando algum preço está sob consulta", () => {
    const order = createOrder(database, {
      ...baseInput,
      items: [{ ...baseInput.items[0], unitPrice: null }],
    });

    expect(order.totalCents).toBeNull();
  });

  it("reutiliza o pedido para a mesma chave do mesmo usuário sem duplicar", () => {
    const first = createOrder(database, baseInput);
    const repeated = createOrder(database, baseInput);

    expect(repeated.id).toBe(first.id);
    expect(listOrdersByUser(database, "user-1")).toHaveLength(1);
  });

  it("restringe a idempotência ao usuário e lista somente os pedidos dele", () => {
    const first = createOrder(database, baseInput);
    const other = createOrder(database, { ...baseInput, userId: "user-2" });

    expect(other.id).not.toBe(first.id);
    expect(listOrdersByUser(database, "user-1").map((order) => order.id)).toEqual([first.id]);
    expect(listOrdersByUser(database, "user-2").map((order) => order.id)).toEqual([other.id]);
  });
});
