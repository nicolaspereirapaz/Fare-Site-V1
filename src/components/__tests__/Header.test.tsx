import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "@/components/Header";
import { CartProvider } from "@/context/CartContext";

function renderHeader(user: { name: string } | null) {
  return render(
    <CartProvider>
      <Header user={user} />
    </CartProvider>,
  );
}

describe("Header", () => {
  it("oferece entrada para visitantes", () => {
    renderHeader(null);

    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
    expect(screen.queryByRole("link", { name: /Minha conta/ })).not.toBeInTheDocument();
  });

  it("oferece a área da conta para usuário autenticado", () => {
    renderHeader({ name: "Ana Silva" });

    expect(screen.getByRole("link", { name: /Minha conta/ })).toHaveAttribute("href", "/minha-conta");
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
  });

  it("no lançamento o menu leva aos brindes, sem o catálogo de produtos próprios", () => {
    renderHeader(null);

    expect(screen.getByRole("link", { name: "Brindes" })).toHaveAttribute("href", "/brindes");
    expect(screen.queryByRole("link", { name: "Produtos" })).not.toBeInTheDocument();
  });
});
