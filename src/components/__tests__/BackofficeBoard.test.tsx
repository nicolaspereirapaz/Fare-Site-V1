import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackofficeBoard } from "@/components/BackofficeBoard";

const ORDER = {
  id: "order-1",
  status: "aguardando_pagamento" as const,
  paymentMethod: "pix" as const,
  customerName: "Cliente Teste",
  customerPhone: "11988887777",
  customerCompany: null,
  itemCount: 2,
  total: 250,
  createdAt: "2026-09-28T12:00:00.000Z",
  code: "FF-ORDER1",
  notes: null,
  billing: null,
  items: [
    { productName: "Caneta Plástica", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.64 },
    { productName: "Foto 10x15", quantity: 1, selections: {}, unitPrice: null },
  ],
};

const BILLING = {
  personType: "pj" as const,
  document: "11.222.333/0001-81",
  companyName: "Padaria Boa Vista Ltda",
  tradeName: "Padaria Boa Vista",
  stateRegistration: "407.123.456.789",
  address: { cep: "13201-000", street: "Rua Barão de Jundiaí", number: "100", complement: "Sala 2", district: "Centro", city: "Jundiaí", state: "SP" },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("BackofficeBoard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carrega o quadro e mostra os pedidos nas colunas por status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel={false} />);

    expect(await screen.findByText("Cliente Teste")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/backoffice/orders", expect.objectContaining({ cache: "no-store" }));
    expect(screen.getByText("11988887777")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aguardando pagamento" })).toBeInTheDocument();
  });

  it("mostra somente as transições permitidas pelo status atual do pedido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel />);
    const card = (await screen.findByText("Cliente Teste")).closest("article") as HTMLElement;

    expect(within(card).getByRole("button", { name: /Pagamento confirmado/ })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: /Cancelado/ })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Em produção/ })).not.toBeInTheDocument();
  });

  it("não mostra o botão de cancelar quando o papel não pode cancelar pedidos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel={false} />);
    const card = (await screen.findByText("Cliente Teste")).closest("article") as HTMLElement;

    expect(within(card).getByRole("button", { name: /Pagamento confirmado/ })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Cancelado/ })).not.toBeInTheDocument();
  });

  it("mostra o botão de cancelar quando o papel pode cancelar pedidos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel />);
    const card = (await screen.findByText("Cliente Teste")).closest("article") as HTMLElement;

    expect(within(card).getByRole("button", { name: /Cancelado/ })).toBeInTheDocument();
  });

  it("envia PATCH ao clicar em uma transição e recarrega o quadro", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ order: { ...ORDER, status: "pagamento_confirmado" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          orders: [{ ...ORDER, status: "pagamento_confirmado" }],
          counts: { pagamento_confirmado: 1 },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel={false} />);
    await screen.findByText("Cliente Teste");

    await user.click(screen.getByRole("button", { name: /Pagamento confirmado/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/backoffice/orders/order-1");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "pagamento_confirmado" }),
    });
    expect(fetchMock.mock.calls[2][0]).toBe("/api/backoffice/orders");

    expect(await screen.findByRole("heading", { name: "Pagamento confirmado" })).toBeInTheDocument();
  });

  it("mostra o erro da API quando a transição é rejeitada e ainda assim recarrega o quadro", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ error: "INVALID_TRANSITION" }, 409))
      .mockResolvedValueOnce(jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel />);
    await screen.findByText("Cliente Teste");

    await user.click(screen.getByRole("button", { name: /Cancelado/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/transição/i);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });

  it("mostra o erro da API quando o carregamento inicial falha", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "FORBIDDEN" }, 403));
    vi.stubGlobal("fetch", fetchMock);

    render(<BackofficeBoard canCancel={false} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/permissão/i);
  });

  it("mostra o número do pedido e, nos detalhes, faturamento, itens e observações", async () => {
    const order = { ...ORDER, notes: "Entregar até dia 20", billing: BILLING };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ orders: [order], counts: { aguardando_pagamento: 1 } })));
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel={false} />);
    const card = (await screen.findByText("Cliente Teste")).closest("article") as HTMLElement;

    expect(within(card).getByText("#FF-ORDER1")).toBeInTheDocument();
    expect(within(card).getByText("CNPJ 11.222.333/0001-81")).toBeInTheDocument();

    await user.click(within(card).getByText("Ver detalhes"));
    expect(within(card).getByText("Padaria Boa Vista Ltda")).toBeVisible();
    expect(within(card).getByText(/IE 407\.123\.456\.789/)).toBeVisible();
    expect(within(card).getByText(/Rua Barão de Jundiaí, 100, Sala 2 — Centro, Jundiaí\/SP — CEP 13201-000/)).toBeVisible();
    expect(within(card).getByText(/100 × Caneta Plástica/)).toBeVisible();
    expect(within(card).getByText(/Variação: Azul/)).toBeVisible();
    expect(within(card).getByText(/sob consulta/)).toBeVisible();
    expect(within(card).getByText("Entregar até dia 20")).toBeVisible();
  });

  it("avisa quando o pedido não tem dados de faturamento", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ orders: [ORDER], counts: { aguardando_pagamento: 1 } })));
    render(<BackofficeBoard canCancel={false} />);
    const card = (await screen.findByText("Cliente Teste")).closest("article") as HTMLElement;
    expect(within(card).getByText("Sem dados de faturamento")).toBeInTheDocument();
  });
});
