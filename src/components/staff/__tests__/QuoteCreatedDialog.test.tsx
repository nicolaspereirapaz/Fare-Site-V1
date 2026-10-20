import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuoteCreatedDialog } from "@/components/staff/QuoteCreatedDialog";

describe("prévia do HTML ao criar o orçamento", () => {
  it("desenha o HTML da proposta na página (sem iframe/visualizador do navegador), com Baixar e Abrir em outra aba", () => {
    const { container } = render(<QuoteCreatedDialog code="ORC-AB12CD" onClose={vi.fn()} quoteId="q-1" />);
    expect(screen.getByRole("dialog", { name: "Orçamento ORC-AB12CD criado" })).toBeInTheDocument();
    expect(screen.getByTitle("Prévia da proposta ORC-AB12CD")).toHaveAttribute("src", "/api/backoffice/quotes/q-1/proposta?ver=1");
    expect(container.querySelector("iframe")).toHaveAttribute("sandbox", "allow-scripts");
    expect(screen.getByRole("link", { name: /Baixar HTML/ })).toHaveAttribute("href", "/api/backoffice/quotes/q-1/proposta");
    expect(screen.getByRole("link", { name: /Abrir em outra aba/ })).toHaveAttribute("href", "/api/backoffice/quotes/q-1/proposta?ver=1");
  });

  it("Fechar e Esc levam ao quadro", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<QuoteCreatedDialog code="ORC-AB12CD" onClose={onClose} quoteId="q-1" />);
    await user.click(screen.getByRole("button", { name: /Ir para o quadro/ }));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("prévia ao salvar pedido ou edição", () => {
  it("pedido: mostra o documento do pedido; edição: diz salvo", async () => {
    const { render: draw, screen: view } = await import("@testing-library/react");
    const { container } = draw(<QuoteCreatedDialog code="PED-AB12CD" kind="order" onClose={vi.fn()} quoteId="o-1" />);
    expect(view.getByRole("heading", { name: /Pedido PED-AB12CD criado/ })).toBeInTheDocument();
    expect(container.querySelector("iframe")).toHaveAttribute("src", "/api/backoffice/orders/o-1/documento?ver=1");
    draw(<QuoteCreatedDialog code="ORC-XY" onClose={vi.fn()} quoteId="q-2" verb="salvo" />);
    expect(view.getByRole("heading", { name: /Orçamento ORC-XY salvo/ })).toBeInTheDocument();
  });
});
