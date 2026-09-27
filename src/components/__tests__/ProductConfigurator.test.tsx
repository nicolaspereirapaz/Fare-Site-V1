import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ProductConfigurator } from "../ProductConfigurator";
import { CartProvider, useCart } from "@/context/CartContext";
import { getProductBySlug } from "@/data/products";

function CartProbe() {
  const { items } = useCart();
  return <pre data-testid="cart-state">{JSON.stringify(items)}</pre>;
}

describe("ProductConfigurator", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds the selected configuration and artwork name to the cart", async () => {
    const user = userEvent.setup();
    const product = getProductBySlug("caneca-personalizada");
    expect(product).toBeDefined();

    render(
      <CartProvider>
        <ProductConfigurator product={product!} />
        <CartProbe />
      </CartProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Mágica" }));
    await user.selectOptions(screen.getByLabelText("Quantidade"), "5");
    fireEvent.change(screen.getByLabelText("Enviar arte agora (opcional)"), {
      target: { files: [new File(["arte"], "arte-caneca.pdf", { type: "application/pdf" })] },
    });
    await user.click(screen.getByRole("button", { name: /adicionar ao carrinho/i }));

    const state = screen.getByTestId("cart-state").textContent ?? "";
    expect(state).toContain('"quantity":5');
    expect(state).toContain('"Modelo":"Mágica"');
    expect(state).toContain('"artworkName":"arte-caneca.pdf"');
    expect(screen.getByText(/configuração adicionada/i)).toBeInTheDocument();
  });

  it("shows the photographic print options and quantity ranges", async () => {
    const user = userEvent.setup();
    const product = getProductBySlug("revelacao-de-fotos");
    expect(product).toBeDefined();

    render(
      <CartProvider>
        <ProductConfigurator product={product!} />
        <CartProbe />
      </CartProvider>,
    );

    expect(screen.getByText("Papel Fotográfico Fujifilm")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10 × 15 cm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fosco" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Brilhante" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Com borda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sem borda" })).toBeInTheDocument();

    const range = screen.getByRole("radio", { name: /21 a 50 fotos/i });
    await user.click(range);
    await user.click(screen.getByRole("button", { name: /adicionar ao carrinho/i }));

    expect(screen.getByTestId("cart-state")).toHaveTextContent(
      '"quantityRange":"21 a 50 fotos"',
    );
  });
});
