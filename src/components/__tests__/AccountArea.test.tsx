import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountNav } from "@/components/account/AccountNav";
import { AccountOrders, type AccountOrder } from "@/components/account/AccountOrders";
import { orderCode } from "@/lib/orders/orderCode";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/minha-conta/pedidos" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

const ORDER: AccountOrder = {
  id: "3f7a2c9e-a9cb-44f6-8f99-1e6e13241ebf",
  status: "aguardando_pagamento",
  paymentMethod: "pix",
  totalCents: 271600,
  createdAt: "2026-09-27T15:30:00.000Z",
  items: [
    { productName: "Caneca Acrílica", quantity: 100, color: "Azul", unitPrice: 27.16 },
    { productName: "Álbum personalizado", quantity: 2, color: null, unitPrice: null, quantityRange: undefined },
  ],
};

describe("menu lateral da Minha conta", () => {
  beforeEach(() => {
    pathname.current = "/minha-conta/pedidos";
  });

  it("lista as seções em links separados e o botão de sair", () => {
    render(<AccountNav />);
    const nav = screen.getByRole("navigation", { name: "Minha conta" });
    expect(within(nav).getByRole("link", { name: /Pedidos/ })).toHaveAttribute("href", "/minha-conta/pedidos");
    expect(within(nav).getByRole("link", { name: /Orçamentos/ })).toHaveAttribute("href", "/minha-conta/orcamentos");
    expect(within(nav).getByRole("link", { name: /Dados pessoais/ })).toHaveAttribute("href", "/minha-conta/dados");
    expect(within(nav).getByRole("button", { name: /Sair da conta/ })).toBeInTheDocument();
  });

  it("marca a seção aberta", () => {
    pathname.current = "/minha-conta/dados";
    render(<AccountNav />);
    expect(screen.getByRole("link", { name: /Dados pessoais/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Pedidos/ })).not.toHaveAttribute("aria-current");
  });
});

describe("número curto do pedido", () => {
  it("é legível e estável para o mesmo pedido", () => {
    expect(orderCode("3f7a2c9e-a9cb-44f6-8f99-1e6e13241ebf")).toBe("FF-3F7A2C");
    expect(orderCode("3f7a2c9e-a9cb-44f6-8f99-1e6e13241ebf")).toBe(orderCode("3f7a2c9e-0000"));
  });
});

describe("página de pedidos", () => {
  it("mostra estado vazio com caminho para comprar", () => {
    render(<AccountOrders orders={[]} />);
    expect(screen.getByText("Nenhum pedido por enquanto.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver brindes/ })).toHaveAttribute("href", "/brindes");
  });

  it("mostra número curto, data, status, pagamento, itens com cor e total", () => {
    render(<AccountOrders orders={[ORDER]} />);
    const order = screen.getByRole("article", { name: "Pedido #FF-3F7A2C" });
    expect(order).toHaveTextContent("27/09/2026");
    expect(order).toHaveTextContent("Pedido enviado");
    expect(order).not.toHaveTextContent("Aguardando pagamento");
    expect(order).toHaveTextContent("A equipe vai confirmar valores, prazo e pagamento pelo WhatsApp.");
    expect(order).toHaveTextContent("Pix");
    expect(order).toHaveTextContent(/Caneca Acrílica.*Azul.*100 un\..*R\$\s27,16\/un\./);
    expect(order).toHaveTextContent(/Álbum personalizado.*2 un\..*sob consulta/);
    expect(order).toHaveTextContent(/Total estimado\s*R\$\s2\.716,00/);
    expect(order).not.toHaveTextContent(ORDER.id);
  });

  it("depois de confirmado, o status segue o andamento e some o aviso de confirmação", () => {
    render(<AccountOrders orders={[{ ...ORDER, status: "em_producao" }]} />);
    const order = screen.getByRole("article", { name: "Pedido #FF-3F7A2C" });
    expect(order).toHaveTextContent("Em produção");
    expect(order).not.toHaveTextContent("A equipe vai confirmar");
  });

  it("forma de pagamento aparece como a escolhida pelo cliente, não como pagamento feito", () => {
    render(<AccountOrders orders={[ORDER]} />);
    expect(screen.getByRole("article", { name: "Pedido #FF-3F7A2C" })).toHaveTextContent("Pagamento: Pix");
  });

  it("pedido vindo de orçamento com desconto mostra a linha do desconto antes do total", () => {
    render(<AccountOrders orders={[{ ...ORDER, discount: { label: "Desconto (10%)", amount: 25 } }]} />);
    expect(screen.getByText("Desconto (10%)")).toBeInTheDocument();
    expect(screen.getByText(/− R\$\s?25,00/)).toBeInTheDocument();
  });

  it("tem um atalho para falar sobre o pedido no WhatsApp da loja", () => {
    render(<AccountOrders orders={[ORDER]} />);
    const link = screen.getByRole("link", { name: /Falar sobre este pedido/ });
    const url = new URL(link.getAttribute("href")!);
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/5511953147703");
    expect(url.searchParams.get("text")).toContain("#FF-3F7A2C");
  });
});
