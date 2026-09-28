import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, requestCheckout } = vi.hoisted(() => ({
  push: vi.fn(),
  requestCheckout: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: [{
      id: "item-1",
      productName: "Foto 10x15",
      slug: "foto-10x15",
      quantity: 1,
      selections: {},
      artworkName: null,
      unitPrice: null,
      image: "/foto.jpg",
    }],
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
  }),
}));
vi.mock("@/lib/requestCheckout", () => ({ requestCheckout }));

import { CartView } from "@/components/CartView";

describe("CartView", () => {
  beforeEach(() => {
    push.mockReset();
    requestCheckout.mockReset();
    requestCheckout.mockResolvedValue({ requiresAuth: true });
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
