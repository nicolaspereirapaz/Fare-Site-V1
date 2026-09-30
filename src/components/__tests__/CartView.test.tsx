import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, requestCheckout, cart, updateQuantity } = vi.hoisted(() => ({
  push: vi.fn(),
  requestCheckout: vi.fn(),
  cart: { items: [] as unknown[] },
  updateQuantity: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ items: cart.items, removeItem: vi.fn(), updateQuantity }),
}));
vi.mock("@/lib/requestCheckout", () => ({ requestCheckout }));

import { CartView } from "@/components/CartView";

const PHOTO_ITEM = {
  id: "item-1", productName: "Foto 10x15", slug: "foto-10x15", quantity: 1,
  selections: {}, artworkName: null, unitPrice: null, image: "/foto.jpg",
};

describe("CartView", () => {
  beforeEach(() => {
    push.mockReset();
    requestCheckout.mockReset();
    requestCheckout.mockResolvedValue({ requiresAuth: true });
    updateQuantity.mockReset();
    cart.items = [PHOTO_ITEM];
  });

  it("deixa digitar a quantidade e confirma com Enter", async () => {
    const user = userEvent.setup();
    render(<CartView />);
    const input = screen.getByRole("textbox", { name: "Quantidade de Foto 10x15" });
    expect(input).toHaveValue("1");

    await user.clear(input);
    await user.type(input, "350{Enter}");
    expect(updateQuantity).toHaveBeenCalledWith("item-1", 350);
  });

  it("confirma a quantidade digitada ao sair do campo e aceita só números", async () => {
    const user = userEvent.setup();
    render(<CartView />);
    const input = screen.getByRole("textbox", { name: "Quantidade de Foto 10x15" });

    await user.clear(input);
    await user.type(input, "1a2b0");
    expect(input).toHaveValue("120");
    await user.tab();
    expect(updateQuantity).toHaveBeenCalledWith("item-1", 120);
  });

  it("volta para a quantidade atual se o campo ficar vazio ou zero", async () => {
    const user = userEvent.setup();
    render(<CartView />);
    const input = screen.getByRole("textbox", { name: "Quantidade de Foto 10x15" });

    await user.clear(input);
    await user.type(input, "0");
    await user.tab();
    expect(updateQuantity).not.toHaveBeenCalled();
    expect(input).toHaveValue("1");
  });

  it("mostra valor estimado por unidade, subtotal e total dos brindes com preço", () => {
    cart.items = [
      { ...PHOTO_ITEM, id: "b1", productName: "Caneta", slug: "brindes/x", quantity: 300, unitPrice: 1.97,
        pricing: { unitSaleCents: 164, freightCents: 10000 } },
      { ...PHOTO_ITEM, id: "b2", productName: "Caneca", slug: "brindes/y", quantity: 100, unitPrice: 27.16,
        pricing: { unitSaleCents: 2616, freightCents: 10000 } },
    ];
    render(<CartView />);

    expect(screen.queryByText("Valor sob consulta")).not.toBeInTheDocument();
    expect(screen.getByText(/R\$\s1,97\/un\. estimado/)).toBeInTheDocument();
    expect(screen.getByText(/Subtotal R\$\s591,00/)).toBeInTheDocument();
    expect(screen.getByText(/Subtotal R\$\s2\.716,00/)).toBeInTheDocument();
    expect(screen.getByText(/Total estimado/).closest(".cart-estimate")).toHaveTextContent(/R\$\s3\.307,00/);
  });

  it("usa fundo cinza claro só nas fotos de brindes", () => {
    cart.items = [
      { ...PHOTO_ITEM, id: "b1", productName: "Caneta", slug: "brindes/x", image: "/caneta.jpg" },
      PHOTO_ITEM,
    ];
    const { container } = render(<CartView />);
    const images = container.querySelectorAll(".cart-item-image");
    expect(images[0]).toHaveClass("supplier-photo");
    expect(images[1]).not.toHaveClass("supplier-photo");
  });

  it("mantém 'Valor sob consulta' para itens sem preço", () => {
    render(<CartView />);
    expect(screen.getByText("Valor sob consulta")).toBeInTheDocument();
    expect(screen.queryByText(/Total estimado/)).not.toBeInTheDocument();
  });

  it("exige uma forma de pagamento e informa a aprovação do faturamento", () => {
    render(<CartView />);

    const payment = screen.getByRole("combobox", { name: "Forma de pagamento" });
    expect(payment).toBeRequired();
    expect(payment).toHaveValue("");
    expect(screen.getByRole("option", { name: "Pix" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cartão de crédito" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cartão de débito" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Boleto" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Faturamento para empresa" })).toBeInTheDocument();
    expect(screen.getByText(/faturamento para empresa está sujeito à aprovação/i)).toBeInTheDocument();
  });

  it("envia pagamento e chave de idempotência ao criar o pedido", async () => {
    const user = userEvent.setup();
    render(<CartView />);

    await user.type(screen.getByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("WhatsApp para retorno"), "11999999999");
    await user.selectOptions(screen.getByLabelText("Forma de pagamento"), "faturamento_empresa");
    await user.click(screen.getByRole("button", { name: "Criar pedido e abrir WhatsApp" }));

    expect(requestCheckout).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: "faturamento_empresa",
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/),
    }));
    expect(push).toHaveBeenCalledWith("/entrar?callbackURL=/carrinho");
  });
});
