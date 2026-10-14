import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuoteCreatedDialog } from "@/components/staff/QuoteCreatedDialog";

/* Depois de "Criar orçamento": prévia do PDF da proposta, com Baixar e Fechar. */

describe("prévia do PDF ao criar o orçamento", () => {
  it("mostra o PDF da proposta, o botão de baixar e abrir em outra aba", () => {
    render(<QuoteCreatedDialog code="ORC-AB12CD" onClose={vi.fn()} quoteId="q-1" />);
    expect(screen.getByRole("dialog", { name: "Orçamento ORC-AB12CD criado" })).toBeInTheDocument();
    expect(screen.getByTitle("Prévia da proposta ORC-AB12CD")).toHaveAttribute("src", "/api/backoffice/quotes/q-1/proposta?ver=1");
    expect(screen.getByRole("link", { name: /Baixar PDF/ })).toHaveAttribute("href", "/api/backoffice/quotes/q-1/proposta");
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
