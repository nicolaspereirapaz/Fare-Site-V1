import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuoteItemPricing } from "@/components/QuoteItemPricing";

const READ = {
  item: { productName: "Caneta Plástica", quantity: 100, selections: { "Variação": "Azul" }, unitPrice: 2.64, costing: null },
  product: { name: "Caneta Plástica", category: "Canetas e Lápis", supplier: "spot", cost: 0.82, fareCode: "S10001", supplierCode: "Spot 11110", spotReference: "11110" },
  spotOptions: [{ id: "11110.LSR", tecnica: "Laser", local: "Lateral clipe", componente: "Esferográfica", area: "40 × 4 mm", cores: 1, padrao: true, faixas: [{ minimo: 1, preco: 64.99 }, { minimo: 100, preco: 2.85 }] }],
  techniques: [
    { tipo: "nenhuma", label: "Sem personalização", info: "" },
    { tipo: "laser", label: "Laser", info: "" },
    { tipo: "dtf-textil", label: "DTF Têxtil", info: "" },
    { tipo: "dtf-uv", label: "DTF UV", info: "" },
    { tipo: "spot", label: "Personalização Spot", info: "" },
    { tipo: "manual", label: "Outra (manual)", info: "" },
  ],
  freteFornecedor: 100,
  editable: true,
};

const RESULT = { descricao: "DTF UV 5×5 cm", detalhe: "3 folhas 28×40 cm + frete R$ 10,00", custoPersonalizacaoTotal: 109, personalizacaoUnitaria: 1.09, precoUnitarioFinal: 4.82, totalCliente: 482 };

function mockFetch() {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method) return new Response(JSON.stringify(READ), { status: 200 });
    return new Response(JSON.stringify({ result: RESULT, custoProduto: 0.82, total: 482 }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));
  return { fetchMock, posts };
}

afterEach(() => vi.unstubAllGlobals());

describe("formar preço do item do orçamento", () => {
  it("mostra o custo do produto, códigos e as técnicas (inclusive as da Spot)", async () => {
    mockFetch();
    render(<QuoteItemPricing index={0} onBack={() => {}} onSaved={() => {}} quoteId="q1" />);
    expect(await screen.findByText("R$ 0,82")).toBeInTheDocument();
    expect(screen.getByText(/S10001 · Spot 11110/)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Personalização Spot" })).toBeInTheDocument();
  });

  it("DTF UV pede largura e altura e simula no servidor", async () => {
    const { posts } = mockFetch();
    render(<QuoteItemPricing index={0} onBack={() => {}} onSaved={() => {}} quoteId="q1" />);
    fireEvent.click(await screen.findByRole("radio", { name: "DTF UV" }));
    fireEvent.change(screen.getByLabelText("Largura da arte (cm)"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Altura da arte (cm)"), { target: { value: "5" } });

    expect(await screen.findByText("3 folhas 28×40 cm + frete R$ 10,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 4,82")).toBeInTheDocument();
    await waitFor(() => expect(posts().at(-1)).toEqual({ quantidade: 100, tecnica: { tipo: "dtf-uv", larguraCm: 5, alturaCm: 5 } }));
  });

  it("Spot: escolhe a opção da lista; manual: nome e custo por peça", async () => {
    const { posts } = mockFetch();
    render(<QuoteItemPricing index={0} onBack={() => {}} onSaved={() => {}} quoteId="q1" />);
    fireEvent.click(await screen.findByRole("radio", { name: "Personalização Spot" }));
    await waitFor(() => expect(posts().at(-1)?.tecnica).toEqual({ tipo: "spot", opcaoId: "11110.LSR" }));

    fireEvent.click(screen.getByRole("radio", { name: "Outra (manual)" }));
    fireEvent.change(screen.getByLabelText("Nome da personalização"), { target: { value: "Silk 1 cor" } });
    fireEvent.change(screen.getByLabelText("Custo por peça (R$)"), { target: { value: "1,20" } });
    await waitFor(() => expect(posts().at(-1)?.tecnica).toEqual({ tipo: "manual", nome: "Silk 1 cor", custoUnitario: 1.2 }));
  });

  it("aplicar grava no orçamento", async () => {
    const { posts } = mockFetch();
    const onSaved = vi.fn();
    render(<QuoteItemPricing index={0} onBack={() => {}} onSaved={onSaved} quoteId="q1" />);
    fireEvent.click(await screen.findByRole("radio", { name: "Laser" }));
    await screen.findByText("R$ 4,82");
    fireEvent.click(screen.getByRole("button", { name: /Aplicar no orçamento/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(posts().at(-1)).toEqual({ quantidade: 100, tecnica: { tipo: "laser" }, aplicar: true });
  });
});
