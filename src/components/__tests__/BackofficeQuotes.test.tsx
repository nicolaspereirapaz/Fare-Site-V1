import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackofficeBoard } from "@/components/BackofficeBoard";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

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
  code: "PED-ORDER9",
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
  beforeEach(() => { push.mockClear(); vi.stubGlobal("confirm", vi.fn(() => true)); });
  afterEach(() => vi.unstubAllGlobals());

  it("tem as colunas delimitadas Aguardando orçamento | Em negociação | Aguardando pagamento", async () => {
    stubApi();
    await openQuotesTab();
    await screen.findByText("Cliente Orçamento");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Aguardando orçamento", "Em negociação", "Aguardando pagamento"]);
    expect(screen.getByRole("region", { name: "Em negociação" })).toHaveClass("kb-column");
  });

  it("orçamento recém-criado (?novo=<id>) aparece em destaque e o parâmetro sai da URL", async () => {
    stubApi({ quotes: [QUOTE, { ...QUOTE, id: "novo-1", code: "ORC-NOVO01", customerName: "Acabou de criar", status: "em_negociacao" }] });
    window.history.replaceState(null, "", "/equipe?aba=orcamentos&novo=novo-1");
    render(<BackofficeBoard canCancel={false} freshQuoteId="novo-1" initialTab="orcamentos" />);
    const fresh = await cardOf("Acabou de criar");
    expect(fresh).toHaveClass("is-new");
    expect(within(screen.getByRole("region", { name: "Em negociação" })).getByText("Acabou de criar")).toBeInTheDocument();
    expect((await cardOf("Cliente Orçamento"))).not.toHaveClass("is-new");
    expect(window.location.search).toBe("?aba=orcamentos");
  });

  it("a animação do recém-criado toca uma vez só (trocar de aba e voltar não repete)", async () => {
    stubApi({ quotes: [{ ...QUOTE, id: "novo-1", customerName: "Acabou de criar", status: "em_negociacao" }] });
    const user = userEvent.setup();
    render(<BackofficeBoard canCancel={false} freshQuoteId="novo-1" initialTab="orcamentos" />);
    expect(await cardOf("Acabou de criar")).toHaveClass("is-new");
    await user.click(screen.getByRole("tab", { name: /Pedidos/ }));
    await user.click(screen.getByRole("tab", { name: /Orçamentos/ }));
    expect(await cardOf("Acabou de criar")).not.toHaveClass("is-new");
  });

  it("orçamento que virou pedido ou foi encerrado sai do quadro", async () => {
    stubApi({ quotes: [QUOTE, { ...QUOTE, id: "q2", customerName: "Já é pedido", status: "virou_pedido" }, { ...QUOTE, id: "q3", customerName: "Desistiu", status: "encerrado" }] });
    await openQuotesTab();
    await screen.findByText("Cliente Orçamento");
    expect(screen.queryByText("Já é pedido")).not.toBeInTheDocument();
    expect(screen.queryByText("Desistiu")).not.toBeInTheDocument();
  });

  it("cartão abre a consulta completa sem mudar etapa",async()=>{
    const api=stubApi();const user=await openQuotesTab();const card=await cardOf('Cliente Orçamento');
    expect(within(card).getByText('#ORC-3F7A2C')).toBeInTheDocument();await user.click(card);
    expect(push).toHaveBeenCalledWith(`/equipe/orcamentos/${QUOTE.id}/consulta`);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false);
  });

  it("Fechar Orçamento aparece somente em Aguardando pagamento e abre pagamento/entrega",async()=>{
    stubApi({quotes:[QUOTE,{...QUOTE,id:'waiting',customerName:'Aguardando',status:'aguardando_pagamento'}]});const user=await openQuotesTab();
    expect(within(await cardOf('Cliente Orçamento')).queryByRole('button',{name:'Fechar Orçamento'})).not.toBeInTheDocument();
    await user.click(within(await cardOf('Aguardando')).getByRole('button',{name:'Fechar Orçamento'}));
    const dialog=screen.getByRole('dialog',{name:'Fechar Orçamento'});
    expect(within(dialog).getByLabelText('Valor recebido agora')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Data prevista de entrega')).toBeInTheDocument();expect(push).not.toHaveBeenCalled();
  });

  it("pedido do site abre sua página, nunca a edição do orçamento",async()=>{
    stubApi({quotes:[],orders:[SITE_ORDER]});const user=await openQuotesTab();const card=await cardOf('Comprou no Site');
    expect(within(card).getByText('#PED-ORDER9')).toBeInTheDocument();expect(within(card).queryByRole('button',{name:'Fechar Orçamento'})).not.toBeInTheDocument();
    await user.click(card);expect(push).toHaveBeenCalledWith('/equipe/pedidos/order-9');
  });

  it("cancelar o fechamento não gera pedido nem grava recebimento",async()=>{
    const api=stubApi({quotes:[{...QUOTE,status:'aguardando_pagamento'}]});const user=await openQuotesTab();
    await user.click(screen.getByRole('button',{name:'Fechar Orçamento'}));await user.click(screen.getByRole('button',{name:'Cancelar'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(api.mock.calls.some(([,init])=>init?.method==='POST')).toBe(false);
  });

  it("Novo pedido só aparece na aba Pedidos, não na aba Orçamentos",async()=>{
    stubApi();const user=userEvent.setup();render(<BackofficeBoard canCancel={false}/>);
    expect(screen.getByRole('link',{name:'Novo pedido'})).toHaveAttribute('href','/equipe/pedidos/novo');
    await user.click(screen.getByRole('tab',{name:/Orçamentos/}));expect(screen.queryByRole('link',{name:'Novo pedido'})).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Novo orçamento'})).toBeInTheDocument();
  });
});
