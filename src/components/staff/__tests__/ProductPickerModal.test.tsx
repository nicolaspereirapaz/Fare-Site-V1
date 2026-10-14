import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PICKER, parseCostInput, ProductPickerModal, suggestedVariant } from "@/components/staff/ProductPickerModal";
import type { Product } from "@/components/staff/quoteEditorShared";

/* Janela "Escolha o produto": achados da revisão do GPT (14/10). */

function product(id: string, variants: Array<[string, number, number]>): Product & { match: { cost: number; stock: number; colors: number } } {
  return {
    publicId: id, name: `Produto ${id}`, category: "Canetas", imageUrl: "", fareCode: `X${id}`, supplierCode: `XBZ ${id}`, supplier: "xbz", description: "",
    variants: variants.map(([label, cost, stock]) => ({ label, cost, stock, imageUrl: "" })),
    spotOptions: [],
    match: { cost: Math.min(...variants.map((v) => v[1])), stock: variants.reduce((s, v) => s + v[2], 0), colors: variants.length },
  };
}

describe("cor sugerida ao abrir a configuração", () => {
  const caneca = product("1", [["Vermelho", 9, 5000], ["Azul", 4, 800], ["Azul Royal", 6, 3000]]);

  it("respeita a faixa de custo filtrada (não sugere cor fora do custo)", () => {
    expect(suggestedVariant(caneca, { ...EMPTY_PICKER, maxCost: 5 })).toBe("Azul");
  });

  it("respeita custo mínimo, grupo de cor e estoque juntos", () => {
    expect(suggestedVariant(caneca, { ...EMPTY_PICKER, minCost: 5, colorGroup: "Azul" })).toBe("Azul Royal");
    expect(suggestedVariant(caneca, { ...EMPTY_PICKER, colorGroup: "Azul", minStock: "1000" })).toBe("Azul Royal");
  });

  it("sem filtros, fica com a cor de mais estoque", () => {
    expect(suggestedVariant(caneca, EMPTY_PICKER)).toBe("Vermelho");
  });
});

describe("custo digitado no filtro", () => {
  it("mantém os centavos (catálogo tem muito brinde abaixo de R$ 1)", () => {
    expect(parseCostInput("0,50")).toBe(0.5);
    expect(parseCostInput("R$ 2,35")).toBe(2.35);
    expect(parseCostInput("12")).toBe(12);
    expect(parseCostInput("1,999")).toBe(2);
  });

  it("texto vazio ou inválido = sem valor", () => {
    expect(parseCostInput("")).toBeNull();
    expect(parseCostInput("abc")).toBeNull();
  });
});

describe("janela de busca", () => {
  const page1 = { products: [product("1", [["Azul", 1, 100]]), product("2", [["Preto", 2, 100]])], total: 3, page: 1, pages: 2, colorCounts: {} };
  const page2 = { products: [product("3", [["Branco", 3, 100]])], total: 3, page: 2, pages: 2, colorCounts: {} };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("pagina=2") ? page2 : page1), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderPicker = () => {
    const onPick = vi.fn();
    render(<ProductPickerModal initial={EMPTY_PICKER} onClose={vi.fn()} onPick={onPick} onStateChange={vi.fn()} />);
    return { onPick };
  };
  const confirmButton = () => screen.getByRole("button", { name: "Confirmar" });

  it("trocar de página desfaz a seleção (Confirmar não abre produto que sumiu da tela)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByRole("option", { name: "Produto 1" }));
    expect(confirmButton()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await screen.findByRole("option", { name: "Produto 3" });
    expect(confirmButton()).toBeDisabled();
  });

  it("Tab no último botão volta para o começo da janela (foco não vai para a página de trás)", async () => {
    renderPicker();
    await screen.findByRole("option", { name: "Produto 1" });
    const dialog = screen.getByRole("dialog", { name: "Escolha o produto" });
    const voltar = screen.getByRole("button", { name: "Voltar" });
    act(() => voltar.focus());
    // Confirmar está desabilitado: Voltar é o último item focável.
    fireEvent.keyDown(voltar, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(voltar);
  });

  it("janela de detalhes recebe o foco e também prende o Tab", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(await screen.findByRole("button", { name: "Detalhes de Produto 1" }));
    const details = screen.getByRole("dialog", { name: "Detalhes do produto" });
    await waitFor(() => expect(details.contains(document.activeElement)).toBe(true));
    const use = screen.getByRole("button", { name: "Usar este produto" });
    act(() => use.focus());
    fireEvent.keyDown(use, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Fechar detalhes" }));
  });

  it("celular: botão Filtros abre e fecha o painel e mostra quantos filtros estão ativos", async () => {
    const user = userEvent.setup();
    renderPicker();
    await screen.findByRole("option", { name: "Produto 1" });
    const toggle = screen.getByRole("button", { name: /^Filtros/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.selectOptions(screen.getByRole("combobox", { name: "Fornecedor" }), "spot");
    expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveTextContent("Filtros (1)");
    await user.click(screen.getByRole("button", { name: /^Ver \d+ produtos?$/ }));
    expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveAttribute("aria-expanded", "false");
  });
});
