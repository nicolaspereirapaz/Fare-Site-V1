import { describe, expect, it, vi } from "vitest";
import {
  canCancelOrders,
  createListBackofficeOrdersHandler,
  createUpdateBackofficeOrderStatusHandler,
  hasBackofficeAccess,
  resolveUserRole,
} from "@/lib/backoffice/access";
import { ORDEM_STATUS_PEDIDO, TransicaoStatusPedidoInvalidaError } from "@/lib/backoffice/orderStatus";
import type { Order } from "@/lib/orders/repository";

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    userId: "user-1",
    idempotencyKey: "checkout-abc",
    customer: { name: "Ana", phone: "11999999999" },
    items: [{
      id: "item-1",
      productName: "Foto 10x15",
      slug: "foto-10x15",
      quantity: 1,
      selections: {},
      unitPrice: 125,
    }],
    paymentMethod: "pix",
    status: "aguardando_pagamento",
    totalCents: 12500,
    discount: null,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z",
    ...overrides,
  };
}

function listRequest() {
  return new Request("http://localhost/api/backoffice/orders", {
    headers: { cookie: "better-auth.session_token=qualquer" },
  });
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/backoffice/orders/order-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("resolução e permissões de papel do backoffice", () => {
  it("usa cliente como padrão para papel ausente ou desconhecido", () => {
    expect(resolveUserRole(undefined)).toBe("cliente");
    expect(resolveUserRole({ role: "gerente" })).toBe("cliente");
  });

  it("reconhece vendedor e admin", () => {
    expect(resolveUserRole({ role: "vendedor" })).toBe("vendedor");
    expect(resolveUserRole({ role: "admin" })).toBe("admin");
  });

  it("permite acesso ao backoffice apenas para vendedor e admin", () => {
    expect(hasBackofficeAccess("cliente")).toBe(false);
    expect(hasBackofficeAccess("vendedor")).toBe(true);
    expect(hasBackofficeAccess("admin")).toBe(true);
  });

  it("restringe cancelamento ao admin", () => {
    expect(canCancelOrders("vendedor")).toBe(false);
    expect(canCancelOrders("admin")).toBe(true);
  });
});

describe("listagem de pedidos do backoffice", () => {
  it("nega sem sessão", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const handler = createListBackofficeOrdersHandler(getSession, vi.fn());

    const response = await handler(listRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
  });

  it("nega para papel cliente", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "cliente" } });
    const listOrders = vi.fn();
    const handler = createListBackofficeOrdersHandler(getSession, listOrders);

    const response = await handler(listRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("lista pedidos no formato do quadro com total calculado e contagem por status", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const orders = [
      buildOrder({
        id: "order-1",
        items: [
          { id: "item-1", productName: "Foto 10x15", slug: "foto-10x15", quantity: 1, selections: {}, unitPrice: 125 },
          { id: "item-2", productName: "Foto 15x21", slug: "foto-15x21", quantity: 1, selections: {}, unitPrice: 125 },
        ],
      }),
      buildOrder({
        id: "order-2",
        status: "criando_arte",
        customer: { name: "Beto", phone: "11988887777", company: "Estúdio Beto" },
        items: [
          { id: "item-3", productName: "Foto 20x30", slug: "foto-20x30", quantity: 3, selections: {}, unitPrice: null },
        ],
      }),
    ];
    const listOrders = vi.fn().mockReturnValue(orders);
    const handler = createListBackofficeOrdersHandler(getSession, listOrders);

    const response = await handler(listRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.orders).toHaveLength(2);
    expect(payload.orders[0]).toMatchObject({
      id: "order-1",
      status: "aguardando_pagamento",
      paymentMethod: "pix",
      customerName: "Ana",
      customerPhone: "11999999999",
      customerCompany: null,
      itemCount: 2,
      total: 250,
    });
    expect(payload.orders[1]).toMatchObject({
      id: "order-2",
      customerName: "Beto",
      customerCompany: "Estúdio Beto",
      itemCount: 1,
      total: 0,
    });
    expect(payload.orders[0].code).toBe("PED-ORDER1");
    expect(payload.orders[0].billing).toBeNull();
    expect(payload.orders[0].items).toEqual([
      { productName: "Foto 10x15", quantity: 1, selections: {}, unitPrice: 125 },
      { productName: "Foto 15x21", quantity: 1, selections: {}, unitPrice: 125 },
    ]);
    expect(Object.keys(payload.counts).sort()).toEqual([...ORDEM_STATUS_PEDIDO].sort());
    expect(payload.counts.aguardando_pagamento).toBe(1);
    expect(payload.counts.criando_arte).toBe(1);
    expect(payload.counts.cancelado).toBe(0);
  });
});

describe("faturamento no quadro de pedidos", () => {
  it("leva os dados de faturamento gravados no pedido e as notas do cliente", async () => {
    const billing = {
      personType: "pj" as const,
      document: "11.222.333/0001-81",
      companyName: "Padaria Boa Vista Ltda",
      tradeName: "Padaria Boa Vista",
      stateRegistration: "ISENTO",
      address: { cep: "13201-000", street: "Rua A", number: "100", complement: "", district: "Centro", city: "Jundiaí", state: "SP" },
    };
    const getSession = vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    const listOrders = vi.fn().mockReturnValue([
      buildOrder({ customer: { name: "Carlos", phone: "(11) 3333-4444", notes: "Entregar até dia 20", billing } }),
    ]);

    const payload = await (await createListBackofficeOrdersHandler(getSession, listOrders)(listRequest())).json();
    expect(payload.orders[0].billing).toEqual(billing);
    expect(payload.orders[0].notes).toBe("Entregar até dia 20");
  });
});

describe("histórico do pedido no painel", () => {
  it("devolve o histórico de cada pedido (situação, quando e quem)", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const history = vi.fn().mockReturnValue([{ status: "criando_arte", at: "2026-10-09T10:12:00.000Z", by: "Joana" }]);
    const handler = createListBackofficeOrdersHandler(getSession, () => [buildOrder({ id: "order-1" })], history);

    const payload = await (await handler(listRequest())).json();

    expect(history).toHaveBeenCalledWith(expect.objectContaining({ id: "order-1" }));
    expect(payload.orders[0].history).toEqual([{ status: "criando_arte", at: "2026-10-09T10:12:00.000Z", by: "Joana" }]);
  });

  it("sem fonte de histórico, devolve lista vazia", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const payload = await (await createListBackofficeOrdersHandler(getSession, () => [buildOrder({ id: "order-1" })])(listRequest())).json();
    expect(payload.orders[0].history).toEqual([]);
  });
});

describe("pedido vindo de orçamento com desconto", () => {
  it("o total do quadro é o do pedido (com desconto), não a soma dos itens", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const handler = createListBackofficeOrdersHandler(getSession, () => [buildOrder({ totalCents: 11250, discount: { type: "value", value: 12.5 } })]);
    const payload = await (await handler(listRequest())).json();
    expect(payload.orders[0]).toMatchObject({ total: 112.5, discount: { label: "Desconto", amount: 12.5 } });
  });
});

describe("atualização de status de pedido no backoffice", () => {
  it("nega sem sessão", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, vi.fn(), vi.fn());

    const response = await handler(patchRequest({ status: "criando_arte" }), "order-1");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "AUTH_REQUIRED" });
  });

  it("nega para papel cliente", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "cliente" } });
    const findOrder = vi.fn();
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, vi.fn());

    const response = await handler(patchRequest({ status: "criando_arte" }), "order-1");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    expect(findOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["corpo malformado", "{ isso nao e json"],
    ["status fora da lista", JSON.stringify({ status: "status_inexistente" })],
  ])("rejeita %s", async (_label, rawBody) => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "admin" } });
    const findOrder = vi.fn();
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, vi.fn());
    const request = new Request("http://localhost/api/backoffice/orders/order-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: rawBody,
    });

    const response = await handler(request, "order-1");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_REQUEST" });
    expect(findOrder).not.toHaveBeenCalled();
  });

  it("nega vendedor tentando cancelar", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const findOrder = vi.fn();
    const changeOrderStatus = vi.fn();
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, changeOrderStatus);

    const response = await handler(patchRequest({ status: "cancelado" }), "order-1");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "FORBIDDEN" });
    expect(findOrder).not.toHaveBeenCalled();
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  it("permite admin cancelar", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    const findOrder = vi.fn().mockReturnValue(buildOrder({ status: "aguardando_pagamento" }));
    const changeOrderStatus = vi.fn().mockReturnValue(buildOrder({ status: "cancelado" }));
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, changeOrderStatus);

    const response = await handler(patchRequest({ status: "cancelado" }), "order-1");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.order.status).toBe("cancelado");
    expect(changeOrderStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      nextStatus: "cancelado",
      actorId: "admin-1",
    });
  });

  it("responde 404 quando o pedido não existe", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const findOrder = vi.fn().mockReturnValue(null);
    const changeOrderStatus = vi.fn();
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, changeOrderStatus);

    const response = await handler(patchRequest({ status: "criando_arte" }), "order-1");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "ORDER_NOT_FOUND" });
    expect(changeOrderStatus).not.toHaveBeenCalled();
  });

  it("responde 409 para transição inválida", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "user-1", role: "vendedor" } });
    const findOrder = vi.fn().mockReturnValue(buildOrder({ status: "concluido" }));
    const changeOrderStatus = vi.fn(() => {
      throw new TransicaoStatusPedidoInvalidaError("concluido", "criando_arte");
    });
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, changeOrderStatus);

    const response = await handler(patchRequest({ status: "criando_arte" }), "order-1");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_TRANSITION" });
  });

  it("atualiza o status e devolve o pedido no formato do quadro, registrando o ator da sessão", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "vendedor-1", role: "vendedor" } });
    const findOrder = vi.fn().mockReturnValue(buildOrder({ status: "aguardando_pagamento" }));
    const changeOrderStatus = vi.fn().mockReturnValue(buildOrder({ status: "criando_arte" }));
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, changeOrderStatus);

    const response = await handler(patchRequest({ status: "criando_arte" }), "order-1");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.order).toMatchObject({ id: "order-1", status: "criando_arte" });
    expect(findOrder).toHaveBeenCalledWith("order-1");
    expect(changeOrderStatus).toHaveBeenCalledWith({
      orderId: "order-1",
      nextStatus: "criando_arte",
      actorId: "vendedor-1",
    });
  });

  it("pagamento recebido num pedido de fotos pula a arte e vai para Aguardando produção", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "vendedor-1", role: "vendedor" } });
    const photoItem = { id: "10x15-brilho", productName: "Revelação 10x15", slug: "fotos/10x15-brilho", quantity: 3, selections: {}, unitPrice: 3.5 };
    const findOrder = vi.fn().mockReturnValue(buildOrder({ items: [photoItem] }));
    const changeOrderStatus = vi.fn().mockReturnValue(buildOrder({ items: [photoItem], status: "aguardando_producao" }));
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, findOrder, changeOrderStatus);

    const response = await handler(patchRequest({ status: "aguardando_arte" }), "order-1");

    expect(response.status).toBe(200);
    expect(changeOrderStatus).toHaveBeenCalledWith({ orderId: "order-1", nextStatus: "aguardando_producao", actorId: "vendedor-1" });
  });

  it("pedido comum continua indo para Aguardando arte", async () => {
    const getSession = vi.fn().mockResolvedValue({ user: { id: "vendedor-1", role: "vendedor" } });
    const changeOrderStatus = vi.fn().mockReturnValue(buildOrder({ status: "aguardando_arte" }));
    const handler = createUpdateBackofficeOrderStatusHandler(getSession, vi.fn().mockReturnValue(buildOrder()), changeOrderStatus);

    await handler(patchRequest({ status: "aguardando_arte" }), "order-1");

    expect(changeOrderStatus).toHaveBeenCalledWith(expect.objectContaining({ nextStatus: "aguardando_arte" }));
  });
});

describe("códigos no painel da equipe", () => {
  it("a linha do item mostra o código Fare Foto e o código real do fornecedor com o SKU", async () => {
    const { itemCodeLine } = await import("@/components/backofficeShared");
    expect(itemCodeLine({ productName: "Caneca", quantity: 100, selections: {}, unitPrice: 1,
      codes: { fare: "X10001", supplier: "xbz", supplierCode: "06520", sku: "06520-AZU" } }))
      .toBe("X10001 · XBZ 06520 · SKU 06520-AZU");
    expect(itemCodeLine({ productName: "Caneca", quantity: 100, selections: {}, unitPrice: 1 })).toBe("");
  });
});
