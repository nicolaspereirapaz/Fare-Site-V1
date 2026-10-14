import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductConfigModal } from "@/components/staff/ProductConfigModal";
import type { Product } from "@/components/staff/quoteEditorShared";

/* Configuração em fila: vários produtos marcados na janela "Escolha o produto". */

const caneta: Product = {
  publicId: "p1", name: "Caneta", category: "Canetas", imageUrl: "", fareCode: "X1", supplierCode: "XBZ 1", supplier: "xbz",
  variants: [{ label: "Azul", cost: 1, stock: 500, imageUrl: "" }], spotOptions: [],
};

describe("janela de configuração em fila", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mostra a posição na fila, Pular e 'Adicionar e próximo'", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<ProductConfigModal onClose={vi.fn()} onSave={vi.fn()} queue={{ position: 2, total: 3, onSkip }} start={{ kind: "catalogo", product: caneta, variant: "Azul" }} />);
    expect(screen.getByRole("heading", { name: "Configuração do produto 2 de 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar e próximo/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pular" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("no último da fila o botão volta a ser só 'Adicionar'", () => {
    render(<ProductConfigModal onClose={vi.fn()} onSave={vi.fn()} queue={{ position: 3, total: 3, onSkip: vi.fn() }} start={{ kind: "catalogo", product: caneta }} />);
    expect(screen.getByRole("button", { name: /^\s*Adicionar$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pular" })).toBeInTheDocument();
  });

  it("sem fila: sem contador e sem Pular", () => {
    render(<ProductConfigModal onClose={vi.fn()} onSave={vi.fn()} start={{ kind: "catalogo", product: caneta }} />);
    expect(screen.getByRole("heading", { name: "Configuração do produto" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pular" })).not.toBeInTheDocument();
  });
});
