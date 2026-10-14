import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackofficeBoard } from "@/components/BackofficeBoard";

const ORDER = {
  id: "order-1",
  status: "aguardando_arte" as string,
  paymentMethod: "pix" as const,
  customerName: "Cliente Teste",
  customerPhone: "11988887777",
  customerCompany: null as string | null,
  itemCount: 2,
  total: 250,
  createdAt: "2026-09-28T12:00:00.000Z",
  code: "FF-ORDER1",
  notes: null as string | null,
  billing: null as unknown,
  history: [] as Array<{ status: string; at: string; by: string }>,
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

const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** API falsa: devolve a lista atual e aplica os PATCH (como o servidor faria). */
function stubOrdersApi(initial: Array<typeof ORDER>, patchResult?: { status: number; body: unknown }) {
  let orders = initial.map((order) => ({ ...order }));
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/backoffice/orders") return json({ orders, counts: {} });
    if (url === "/api/backoffice/quotes") return json({ quotes: [], counts: {} });
    if (url.startsWith("/api/backoffice/orders/") && init?.method === "PATCH") {
      if (patchResult) return json(patchResult.body, patchResult.status);
      const id = url.split("/").pop();
      const next = JSON.parse(String(init.body)).status as string;
      orders = orders.map((order) => (order.id === id ? { ...order, status: next, history: [...order.history, { status: next, at: new Date().toISOString(), by: "Teste" }] } : order));
      return json({ order: orders.find((order) => order.id === id) });
    }
    return json({ error: "NOT_FOUND" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const cardOf = async (name: string) => (await screen.findByText(name)).closest("article") as HTMLElement;

describe("painel: aba Pedidos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mostra as 6 etapas, cada uma numa coluna delimitada", async () => {
    stubOrdersApi([ORDER]);
    render(<BackofficeBoard canCancel={false} />);
    await screen.findByText("Cliente Teste");

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Aguardando arte", "Criando arte", "Aguardando produção", "Em produção", "Aguardando retirada", "Aguardando feedback", "Finalizado",
    ]);
    const column = screen.getByRole("region", { name: "Aguardando arte" });
    expect(column).toHaveClass("kb-column");
    expect(within(column).getByText("1")).toBeInTheDocument();
  });

  it("o cartão mostra só o essencial: número, valor, cliente e itens", async () => {
    stubOrdersApi([{ ...ORDER, customerCompany: "Padaria Boa Vista" }]);
    render(<BackofficeBoard canCancel={false} />);
    const card = await cardOf("Padaria Boa Vista");

    expect(within(card).getByText("#FF-ORDER1")).toBeInTheDocument();
    expect(within(card).getByText("R$ 250,00")).toBeInTheDocument();
    expect(within(card).getByText("100 × Caneta Plástica · Azul + 1 item")).toBeInTheDocument();
    expect(within(card).queryByText("11988887777")).not.toBeInTheDocument();
    expect(within(card).getByText("Sem dados de faturamento")).toBeInTheDocument();
  });

  it("pedido aguardando pagamento, cancelado ou finalizado sem data/há mais de 24 h não aparece no quadro de pedidos", async () => {
    stubOrdersApi([
      ORDER,
      { ...ORDER, id: "o2", customerName: "Ainda não pagou", status: "aguardando_pagamento" },
      { ...ORDER, id: "o3", customerName: "Já terminou", status: "concluido" },
      { ...ORDER, id: "o5", customerName: "Terminou ontem cedo", status: "concluido", history: [{ status: "concluido", at: new Date(Date.now() - 25 * 3_600_000).toISOString(), by: "Bia" }] },
      { ...ORDER, id: "o4", customerName: "Desistiu", status: "cancelado" },
    ]);
    render(<BackofficeBoard canCancel={false} />);
    await screen.findByText("Cliente Teste");

    expect(screen.queryByText("Ainda não pagou")).not.toBeInTheDocument();
    expect(screen.queryByText("Já terminou")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminou ontem cedo")).not.toBeInTheDocument();
    expect(screen.queryByText("Desistiu")).not.toBeInTheDocument();
  });

  it("quadro estilo Trello: o cartão não tem botões de avançar/voltar; arrasta-se ou muda a etapa no detalhe", async () => {
    stubOrdersApi([ORDER]);
    render(<BackofficeBoard canCancel={false} />);
    const card = await cardOf("Cliente Teste");
    expect(within(card).queryByRole("button", { name: /Avançar|Voltar|Concluir/ })).not.toBeInTheDocument();
    expect(card).toHaveAttribute("aria-roledescription", "cartão arrastável");
  });

  it("'Etapa' no detalhe move o pedido; pular etapas grava cada passo em ordem", async () => {
    const fetchMock = stubOrdersApi([ORDER]);
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel={false} />);
    await user.click(await cardOf("Cliente Teste"));
    const dialog = screen.getByRole("dialog", { name: "Cliente Teste" });

    await user.selectOptions(within(dialog).getByLabelText("Etapa"), "em_producao");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const patches = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH").map(([, init]) => JSON.parse(String((init as RequestInit).body)).status);
    expect(patches).toEqual(["criando_arte", "aguardando_producao", "em_producao"]);
    const column = screen.getByRole("region", { name: "Em produção" });
    expect(await within(column).findByText("Cliente Teste")).toBeInTheDocument();
  });

  it("voltar etapa pelo detalhe também funciona", async () => {
    const fetchMock = stubOrdersApi([{ ...ORDER, status: "aguardando_retirada" }]);
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel={false} />);
    await user.click(await cardOf("Cliente Teste"));
    await user.selectOptions(within(screen.getByRole("dialog")).getByLabelText("Etapa"), "em_producao");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/backoffice/orders/order-1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "em_producao" }) }),
    ));
  });

  it("finalizado há menos de 24 h fica na coluna Finalizado, com o tempo que falta", async () => {
    stubOrdersApi([{ ...ORDER, status: "concluido", history: [{ status: "concluido", at: new Date(Date.now() - 2 * 3_600_000).toISOString(), by: "Bia" }] }]);
    render(<BackofficeBoard canCancel={false} />);
    const column = await screen.findByRole("region", { name: "Finalizado" });
    const card = (await within(column).findByText("Cliente Teste")).closest("article") as HTMLElement;
    expect(within(card).getByText("Sai do quadro em 22 h")).toBeInTheDocument();
  });

  it("em Aguardando feedback, 'Finalizar pedido' (no detalhe) leva para a coluna Finalizado", async () => {
    const fetchMock = stubOrdersApi([{ ...ORDER, status: "aguardando_feedback" }]);
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel />);
    await user.click(await cardOf("Cliente Teste"));

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Finalizar pedido/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/backoffice/orders/order-1",
      expect.objectContaining({ body: JSON.stringify({ status: "concluido" }) }),
    ));
    const column = screen.getByRole("region", { name: "Finalizado" });
    expect(await within(column).findByText("Cliente Teste")).toBeInTheDocument();
  });

  it("'Ver detalhes' abre uma janela no centro com contato, faturamento, itens, observações e histórico", async () => {
    stubOrdersApi([{
      ...ORDER,
      billing: BILLING,
      notes: "Entregar até dia 20",
      history: [{ status: "aguardando_arte", at: "2026-09-28T13:10:00.000Z", by: "Joana" }],
    }]);
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel={false} />);
    const card = await cardOf("Cliente Teste");

    await user.click(card);
    const dialog = screen.getByRole("dialog", { name: "Cliente Teste" });

    expect(within(dialog).getByText("#FF-ORDER1")).toBeInTheDocument();
    expect(within(dialog).getByText("11988887777")).toBeInTheDocument();
    expect(within(dialog).getByText("Padaria Boa Vista Ltda")).toBeInTheDocument();
    expect(within(dialog).getByText(/IE 407\.123\.456\.789/)).toBeInTheDocument();
    expect(within(dialog).getByText("100 × Caneta Plástica · Azul")).toBeInTheDocument();
    expect(within(dialog).getByText("Sob consulta")).toBeInTheDocument();
    expect(within(dialog).getByText("Entregar até dia 20")).toBeInTheDocument();
    expect(within(dialog).getByText("Pagamento recebido")).toBeInTheDocument();
    expect(within(dialog).getByText(/Joana/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", expect.stringContaining("FF-ORDER1"));
    expect(within(dialog).getByLabelText("Etapa")).toHaveValue("aguardando_arte");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(card);
    await user.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelar fica só na janela de detalhes, só para o administrador, e pede confirmação", async () => {
    stubOrdersApi([ORDER]);
    const user = userEvent.setup();
    const { unmount } = render(<BackofficeBoard canCancel={false} />);
    let card = await cardOf("Cliente Teste");
    expect(within(card).queryByRole("button", { name: /Cancelar/ })).not.toBeInTheDocument();
    await user.click(card);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /Cancelar pedido/ })).not.toBeInTheDocument();
    unmount();

    const fetchMock = stubOrdersApi([ORDER]);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    render(<BackofficeBoard canCancel />);
    card = await cardOf("Cliente Teste");
    expect(within(card).queryByRole("button", { name: /Cancelar/ })).not.toBeInTheDocument();
    await user.click(card);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Cancelar pedido/ }));
    expect(confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/backoffice/orders/order-1", expect.anything());
  });

  it("mostra o erro da API quando a mudança é recusada", async () => {
    stubOrdersApi([ORDER], { status: 409, body: { error: "INVALID_TRANSITION" } });
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel={false} />);
    await user.click(await cardOf("Cliente Teste"));
    await user.selectOptions(within(screen.getByRole("dialog")).getByLabelText("Etapa"), "criando_arte");
    expect(await screen.findByRole("alert")).toHaveTextContent("Essa transição de status não é permitida.");
  });

  it("mostra o erro quando o carregamento falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "FORBIDDEN" }, 403)));
    render(<BackofficeBoard canCancel={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para executar esta ação.");
  });
});
