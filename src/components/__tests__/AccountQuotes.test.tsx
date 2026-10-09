import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountQuotes, type AccountQuote } from "@/components/account/AccountQuotes";

const QUOTE: AccountQuote = {
  id: "3f7a2c1b-0000-4000-8000-000000000000",
  status: "aguardando_resposta",
  totalCents: 26400,
  createdAt: "2026-10-08T15:00:00.000Z",
  items: [
    { productName: "Caneta Plástica", quantity: 100, color: "Azul", unitPrice: 2.64 },
    { productName: "Quadro Personalizado", quantity: 2, color: null, unitPrice: null },
  ],
};

describe("aba Orçamentos", () => {
  it("lista o orçamento com número, data, situação, itens e total", () => {
    render(<AccountQuotes quotes={[QUOTE]} />);
    const card = screen.getByRole("article", { name: "Orçamento #ORC-3F7A2C" });
    expect(card).toHaveTextContent("08/10/2026");
    expect(card).toHaveTextContent("Aguardando resposta");
    expect(card).toHaveTextContent("Caneta Plástica");
    expect(card).toHaveTextContent("Azul");
    expect(card).toHaveTextContent("100 un.");
    expect(card).toHaveTextContent("sob consulta");
    expect(within(card).getByText(/264,00/)).toBeInTheDocument();
  });

  it("tem atalho para falar sobre o orçamento no WhatsApp com o número", () => {
    render(<AccountQuotes quotes={[QUOTE]} />);
    const link = screen.getByRole("link", { name: /Falar sobre este orçamento/ });
    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain("orçamento #ORC-3F7A2C");
  });

  it("sem orçamentos, explica como pedir um e oferece o WhatsApp para itens fora do site", () => {
    render(<AccountQuotes quotes={[]} />);
    expect(screen.getByText("Nenhum orçamento por enquanto.")).toBeInTheDocument();
    expect(screen.getByText(/Só quero um orçamento/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver brindes" })).toHaveAttribute("href", "/brindes");
    expect(screen.getByRole("link", { name: /Pedir pelo WhatsApp/ })).toBeInTheDocument();
  });
});
