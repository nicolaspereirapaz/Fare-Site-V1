import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackofficeBoard } from "@/components/BackofficeBoard";

const QUOTE = {
  id: "3f7a2c1b-0000-4000-8000-000000000000",
  code: "ORC-3F7A2C",
  status: "aguardando_orcamento" as string,
  customerName: "Cliente Orçamento",
  customerPhone: "(11) 98888-7777",
  customerCompany: null,
  notes: "Até dia 20",
  billing: null,
  items: [{ productName: "Caneta Plástica", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.64 }],
  itemCount: 1,
  total: 264,
  createdAt: "2026-10-08T12:00:00.000Z",
};

const SITE_ORDER = {
  id: "order-9",
  code: "FF-ORDER9",
  status: "aguardando_pagamento",
  paymentMethod: "pix",
  customerName: "Comprou no Site",
  customerPhone: "11977776666",
  customerCompany: null,
  notes: null,
  billing: null,
  history: [],
  items: [{ productName: "Caneca", quantity: 50, selections: {}, unitPrice: 10 }],
  itemCount: 1,
  total: 500,
  createdAt: "2026-10-08T13:00:00.000Z",
};

const json = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body }) as Response;

function stubApi({ quotes = [QUOTE], orders = [] as Array<typeof SITE_ORDER> } = {}) {
  let currentQuotes = quotes.map((quote) => ({ ...quote }));
  let currentOrders = orders.map((order) => ({ ...order }));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/backoffice/orders") return json({ orders: currentOrders, counts: {} });
    if (url === "/api/backoffice/quotes") return json({ quotes: currentQuotes, counts: {} });
    const next = init?.body ? (JSON.parse(String(init.body)).status as string) : "";
    if (url.startsWith("/api/backoffice/quotes/") && init?.method === "PATCH") {
      const id = url.split("/").pop();
      currentQuotes = currentQuotes.map((quote) => (quote.id === id ? { ...quote, status: next } : quote));
      return json({ quote: currentQuotes.find((quote) => quote.id === id) });
    }
    if (url.startsWith("/api/backoffice/orders/") && init?.method === "PATCH") {
      const id = url.split("/").pop();
      currentOrders = currentOrders.map((order) => (order.id === id ? { ...order, status: next } : order));
      return json({ order: currentOrders.find((order) => order.id === id) });
    }
    return json({ error: "NOT_FOUND" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openQuotesTab(canCancel = false) {
  const user = userEvent.setup();
  render(<BackofficeBoard canCancel={canCancel} />);
  await user.click(screen.getByRole("tab", { name: /Orçamentos/ }));
  return user;
}

const cardOf = async (name: string) => (await screen.findByText(name)).closest("article") as HTMLElement;

describe("painel: aba Orçamentos", () => {
  beforeEach(() => vi.stubGlobal("confirm", vi.fn(() => true)));
  afterEach(() => vi.unstubAllGlobals());

  it("tem as colunas delimitadas Aguardando orçamento | Em negociação | Aguardando pagamento", async () => {
    stubApi();
    await openQuotesTab();
    await screen.findByText("Cliente Orçamento");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Aguardando orçamento", "Em negociação", "Aguardando pagamento"]);
    expect(screen.getByRole("region", { name: "Em negociação" })).toHaveClass("kb-column");
  });

  it("orçamento que virou pedido ou foi encerrado sai do quadro", async () => {
    stubApi({ quotes: [QUOTE, { ...QUOTE, id: "q2", customerName: "Já é pedido", status: "virou_pedido" }, { ...QUOTE, id: "q3", customerName: "Desistiu", status: "encerrado" }] });
    await openQuotesTab();
    await screen.findByText("Cliente Orçamento");
    expect(screen.queryByText("Já é pedido")).not.toBeInTheDocument();
    expect(screen.queryByText("Desistiu")).not.toBeInTheDocument();
  });

  it("cartão sem botões de etapa; clicar abre o detalhe e 'Etapa' move (pulando etapas, passo a passo)", async () => {
    const fetchMock = stubApi();
    const user = await openQuotesTab();
    const card = await cardOf("Cliente Orçamento");
    expect(within(card).getByText("#ORC-3F7A2C")).toBeInTheDocument();
    expect(within(card).getByText("R$ 264,00")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Avançar|Voltar|Encerrar|Pago/ })).not.toBeInTheDocument();

    await user.click(card);
    await user.selectOptions(within(screen.getByRole("dialog")).getByLabelText("Etapa"), "aguardando_pagamento");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patches = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH").map(([, init]) => JSON.parse(String((init as RequestInit).body)).status);
    expect(patches).toEqual(["em_negociacao", "aguardando_pagamento"]);
    const column = screen.getByRole("region", { name: "Aguardando pagamento" });
    expect(await within(column).findByText("Cliente Orçamento")).toBeInTheDocument();
  });

  it("pagamento recebido: o orçamento vira pedido e sai do quadro de orçamentos", async () => {
    const fetchMock = stubApi({ quotes: [{ ...QUOTE, status: "aguardando_pagamento" }] });
    const user = await openQuotesTab();
    await user.click(await cardOf("Cliente Orçamento"));

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Pagamento recebido/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/backoffice/quotes/${QUOTE.id}`,
      expect.objectContaining({ body: JSON.stringify({ status: "virou_pedido" }) }),
    ));
    await waitFor(() => expect(screen.queryByText("Cliente Orçamento")).not.toBeInTheDocument());
  });

  it("pedido feito no site esperando pagamento aparece em Aguardando pagamento e vai para Aguardando arte", async () => {
    const fetchMock = stubApi({ quotes: [], orders: [SITE_ORDER] });
    const user = await openQuotesTab();
    const card = await cardOf("Comprou no Site");
    expect(within(screen.getByRole("region", { name: "Aguardando pagamento" })).getByText("Comprou no Site")).toBeInTheDocument();
    expect(within(card).getByText("#FF-ORDER9")).toBeInTheDocument();
    expect(within(card).getByText("Pedido do site")).toBeInTheDocument();

    await user.click(card);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Pagamento recebido/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/backoffice/orders/order-9",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "aguardando_arte" }) }),
    ));
    await waitFor(() => expect(screen.queryByText("Comprou no Site")).not.toBeInTheDocument());
  });

  it("'Ver detalhes' abre a janela com itens, observações, proposta e as ações extras", async () => {
    const fetchMock = stubApi({ quotes: [{ ...QUOTE, status: "aguardando_pagamento" }] });
    const user = await openQuotesTab();
    await user.click(await cardOf("Cliente Orçamento"));
    const dialog = screen.getByRole("dialog", { name: "Cliente Orçamento" });
    expect(within(dialog).getByText("100 × Caneta Plástica · Azul")).toBeInTheDocument();
    expect(within(dialog).getByText("Até dia 20")).toBeInTheDocument();
    // Só um caminho de WhatsApp: o da proposta (o botão solto do rodapé saiu).
    expect(within(dialog).queryByRole("link", { name: /^WhatsApp$/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Enviar no WhatsApp/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Encerrar orçamento/ })).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText("Etapa"), "em_negociacao");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/backoffice/quotes/${QUOTE.id}`,
      expect.objectContaining({ body: JSON.stringify({ status: "em_negociacao" }) }),
    ));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
