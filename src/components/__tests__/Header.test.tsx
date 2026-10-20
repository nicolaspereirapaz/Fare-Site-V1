import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("junta Brindes e Categorias num item só, que abre as categorias ao passar o mouse", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Header categories={[{ name: "Mochilas", count: 295 }, { name: "Canecas, Copos e Taças", count: 246 }]} user={null} />
      </CartProvider>,
    );
    const trigger = screen.getByRole("link", { name: "Brindes" });

    expect(trigger).toHaveAttribute("href", "/brindes");
    expect(screen.queryByRole("link", { name: "Categorias" })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.hover(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Canecas, Copos e Taças" })).toHaveAttribute(
      "href",
      "/brindes?categoria=Canecas%2C%20Copos%20e%20Ta%C3%A7as",
    );
    expect(screen.getByRole("link", { name: /Ver todos os brindes/ })).toHaveAttribute("href", "/brindes");

    await user.unhover(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  });
});
