import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountOverview } from "@/components/AccountOverview";

describe("AccountOverview", () => {
  it("mostra dados pessoais e estados vazios de pedidos e orçamentos", () => {
    render(<AccountOverview user={{ name: "Ana Silva", email: "ana@example.com", role: "cliente" }} />);

    expect(screen.getByRole("heading", { name: "Olá, Ana Silva" })).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("Nenhum pedido por enquanto.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum orçamento por enquanto.")).toBeInTheDocument();
  });
});
