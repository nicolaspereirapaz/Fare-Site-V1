import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackofficeBoard } from "@/components/BackofficeBoard";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  code: "PED-ORDER1",
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
    push.mockClear();
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

    expect(within(card).getByText("#PED-ORDER1")).toBeInTheDocument();
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

  it("clique abre a página completa, não uma janela",async()=>{
    stubOrdersApi([ORDER]);const user=userEvent.setup();render(<BackofficeBoard canCancel={false}/>);
    await user.click(await cardOf('Cliente Teste'));
    expect(push).toHaveBeenCalledWith('/equipe/pedidos/order-1');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("Enter também abre a consulta do pedido",async()=>{
    stubOrdersApi([ORDER]);const user=userEvent.setup();render(<BackofficeBoard canCancel={false}/>);
    (await cardOf('Cliente Teste')).focus();await user.keyboard('{Enter}');expect(push).toHaveBeenCalledWith('/equipe/pedidos/order-1');
  });

  it("finalizado há menos de 24 h fica na coluna Finalizado, com o tempo que falta", async () => {
    stubOrdersApi([{ ...ORDER, status: "concluido", history: [{ status: "concluido", at: new Date(Date.now() - 2 * 3_600_000).toISOString(), by: "Bia" }] }]);
    render(<BackofficeBoard canCancel={false} />);
    const column = await screen.findByRole("region", { name: "Finalizado" });
    const card = (await within(column).findByText("Cliente Teste")).closest("article") as HTMLElement;
    expect(within(card).getByText("Sai do quadro em 22 h")).toBeInTheDocument();
  });

  it("finalizar fica na consulta, não altera o estilo/ações do cartão",async()=>{
    stubOrdersApi([{...ORDER,status:'aguardando_feedback'}]);render(<BackofficeBoard canCancel/>);
    const card=await cardOf('Cliente Teste');expect(within(card).queryByRole('button',{name:/Finalizar pedido/})).not.toBeInTheDocument();
  });

  it("abrir detalhes não muda o status nem envia pagamento",async()=>{
    const api=stubOrdersApi([{...ORDER,billing:BILLING,notes:'Observação original'}]);const user=userEvent.setup();render(<BackofficeBoard canCancel={false}/>);
    await user.click(await cardOf('Cliente Teste'));expect(push).toHaveBeenCalledWith('/equipe/pedidos/order-1');
    expect(api.mock.calls.some(([,init])=>init?.method==='PATCH'||init?.method==='POST')).toBe(false);
  });

  it("cancelamento não aparece no cartão nem para administrador",async()=>{
    stubOrdersApi([ORDER]);render(<BackofficeBoard canCancel/>);const card=await cardOf('Cliente Teste');
    expect(within(card).queryByRole('button',{name:/Cancelar/})).not.toBeInTheDocument();
  });

  it("pedido recém-criado usa a mesma animação uma única vez",async()=>{
    stubOrdersApi([ORDER]);const user=userEvent.setup();window.history.replaceState(null,'','/equipe?aba=pedidos&novo=order-1');
    render(<BackofficeBoard canCancel={false} freshQuoteId="order-1"/>);
    expect(await cardOf('Cliente Teste')).toHaveClass('is-new');expect(window.location.search).not.toContain('novo=');
    await user.click(screen.getByRole('tab',{name:/Orçamentos/}));await user.click(screen.getByRole('tab',{name:/Pedidos/}));
    expect(await cardOf('Cliente Teste')).not.toHaveClass('is-new');
  });

  it("mostra o erro quando o carregamento falha", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "FORBIDDEN" }, 403)));
    render(<BackofficeBoard canCancel={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Você não tem permissão para executar esta ação.");
  });
});
