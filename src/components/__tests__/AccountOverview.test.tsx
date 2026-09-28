import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountOverview } from "@/components/AccountOverview";

describe("AccountOverview", () => {
  it("mostra dados pessoais e estados vazios de pedidos e orçamentos", () => {
    render(<AccountOverview user={{ name: "Ana Silva", email: "ana@example.com", role: "cliente" }} orders={[]} />);

    expect(screen.getByRole("heading", { name: "Olá, Ana Silva" })).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("Nenhum pedido por enquanto.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum orçamento por enquanto.")).toBeInTheDocument();
  });

  it("lista os pedidos persistidos com status, pagamento, itens e total sob consulta", () => {
    render(<AccountOverview
      user={{ name: "Ana Silva", email: "ana@example.com", role: "cliente" }}
      orders={[{
        id: "order-123",
        status: "aguardando_pagamento",
        paymentMethod: "faturamento_empresa",
        totalCents: null,
        createdAt: "2026-09-27T12:00:00.000Z",
        items: [{ productName: "Álbum personalizado", quantity: 2, quantityRange: undefined }],
      }]}
    />);

    expect(screen.getByRole("heading", { name: "Pedido #order-123" })).toBeInTheDocument();
    expect(screen.getByText("Aguardando pagamento")).toBeInTheDocument();
    expect(screen.getByText("Faturamento para empresa")).toBeInTheDocument();
    expect(screen.getByText("Álbum personalizado × 2")).toBeInTheDocument();
    expect(screen.getByText("Valor sob consulta")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum pedido por enquanto.")).not.toBeInTheDocument();
  });
});
