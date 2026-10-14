import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuoteCreatedDialog } from "@/components/staff/QuoteCreatedDialog";

// O pdf.js não roda no jsdom: aqui só importa QUAL PDF a prévia desenha.
vi.mock("@/components/staff/PdfPreview", () => ({
  PdfPreview: ({ url, label }: { url: string; label: string }) => <div aria-label={label} data-url={url} role="document" />,
}));

/* Depois de "Criar orçamento": prévia do PDF da proposta, com Baixar e Fechar. */

describe("prévia do PDF ao criar o orçamento", () => {
  it("desenha o PDF da proposta na página (sem iframe/visualizador do navegador), com Baixar e Abrir em outra aba", () => {
    const { container } = render(<QuoteCreatedDialog code="ORC-AB12CD" onClose={vi.fn()} quoteId="q-1" />);
    expect(screen.getByRole("dialog", { name: "Orçamento ORC-AB12CD criado" })).toBeInTheDocument();
    expect(screen.getByRole("document", { name: "Prévia da proposta ORC-AB12CD" })).toHaveAttribute("data-url", "/api/backoffice/quotes/q-1/proposta?ver=1");
    expect(container.querySelector("iframe, embed, object")).toBeNull();
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
