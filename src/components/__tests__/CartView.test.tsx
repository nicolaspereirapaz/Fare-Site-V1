import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, requestCheckout, cart, updateQuantity, fetchMyProfile } = vi.hoisted(() => ({
  push: vi.fn(),
  requestCheckout: vi.fn(),
  cart: { items: [] as unknown[] },
  updateQuantity: vi.fn(),
  fetchMyProfile: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ items: cart.items, removeItem: vi.fn(), updateQuantity }),
}));
vi.mock("@/lib/requestCheckout", () => ({ requestCheckout }));
vi.mock("@/lib/account/profileClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/profileClient")>()),
  fetchMyProfile,
}));

import { EMPTY_PROFILE } from "@/lib/account/profile";
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
    fetchMyProfile.mockReset();
    fetchMyProfile.mockResolvedValue(null);
    cart.items = [PHOTO_ITEM];
  });

  it("já vem preenchido com os dados da conta do cliente", async () => {
    fetchMyProfile.mockResolvedValue({ ...EMPTY_PROFILE, personType: "pj", name: "Ana Silva", email: "ana@x.com", phone: "(11) 98888-7777", companyName: "Loja A Ltda", tradeName: "Loja A", complete: true });
    render(<CartView />);
    expect(await screen.findByDisplayValue("Ana Silva")).toBeInTheDocument();
    expect(screen.getByDisplayValue("(11) 98888-7777")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Loja A")).toBeInTheDocument();
  });

  it("mostra para quem o pedido será faturado, com atalho para alterar", async () => {
    fetchMyProfile.mockResolvedValue({
      ...EMPTY_PROFILE, personType: "pj", name: "Ana Silva", email: "ana@x.com", phone: "(11) 98888-7777",
      document: "11.222.333/0001-81", companyName: "Padaria Boa Vista Ltda", stateRegistration: "ISENTO",
      address: { cep: "13201-000", street: "Rua Barão de Jundiaí", number: "100", complement: "", district: "Centro", city: "Jundiaí", state: "SP" },
      complete: true,
    });
    render(<CartView />);
    const box = await screen.findByRole("region", { name: "Faturar para" });
    expect(box).toHaveTextContent("Padaria Boa Vista Ltda");
    expect(box).toHaveTextContent("CNPJ 11.222.333/0001-81");
    expect(box).toHaveTextContent("Jundiaí/SP");
    expect(screen.getByRole("link", { name: "Alterar" })).toHaveAttribute("href", "/minha-conta/dados");
  });

  it("convida a completar o cadastro quando faltam CPF/CNPJ ou endereço, sem bloquear o pedido", async () => {
    fetchMyProfile.mockResolvedValue({ ...EMPTY_PROFILE, name: "Ana Silva", email: "ana@x.com", phone: "(11) 98888-7777", complete: false });
    render(<CartView />);
    const box = await screen.findByRole("region", { name: "Faturar para" });
    expect(box).toHaveTextContent("Complete seu cadastro");
    expect(screen.getByRole("link", { name: /Completar cadastro/ })).toHaveAttribute("href", "/minha-conta/dados");
    expect(screen.getByRole("button", { name: /Criar pedido/ })).toBeEnabled();
  });

  it("não mostra o quadro de faturamento para quem não está logado", async () => {
    render(<CartView />);
    await Promise.resolve();
    expect(screen.queryByRole("region", { name: "Faturar para" })).not.toBeInTheDocument();
  });

  it("não apaga o que o cliente já começou a digitar", async () => {
    let resolve!: (value: unknown) => void;
    fetchMyProfile.mockReturnValue(new Promise((r) => { resolve = r; }));
    const user = userEvent.setup();
    render(<CartView />);
    await user.type(screen.getByRole("textbox", { name: "Nome" }), "Outro Nome");
    resolve({ ...EMPTY_PROFILE, name: "Ana Silva", email: "ana@x.com", phone: "(11) 98888-7777", complete: false });

    expect(await screen.findByDisplayValue("(11) 98888-7777")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome" })).toHaveValue("Outro Nome");
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

  it("'Só quero um orçamento' esconde a forma de pagamento e envia como orçamento", async () => {
    requestCheckout.mockResolvedValue({ requiresAuth: true });
    const user = userEvent.setup();
    render(<CartView />);

    expect(screen.getByRole("radio", { name: /Fazer pedido/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Só quero um orçamento/ }));
    expect(screen.queryByLabelText("Forma de pagamento")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("WhatsApp para retorno"), "11999999999");
    await user.click(screen.getByRole("button", { name: "Pedir orçamento no WhatsApp" }));

    expect(requestCheckout).toHaveBeenCalledTimes(1);
    const [payload, , endpoint] = requestCheckout.mock.calls[0];
    expect(endpoint).toBe("/api/quotes");
    expect(payload).not.toHaveProperty("paymentMethod");
    expect(payload).toMatchObject({ customer: { name: "Ana", phone: "(11) 99999-9999" } });
  });

  it("voltar para 'Fazer pedido' volta a exigir a forma de pagamento", async () => {
    const user = userEvent.setup();
    render(<CartView />);
    await user.click(screen.getByRole("radio", { name: /Só quero um orçamento/ }));
    await user.click(screen.getByRole("radio", { name: /Fazer pedido/ }));
    expect(screen.getByLabelText("Forma de pagamento")).toBeRequired();
    expect(screen.getByRole("button", { name: "Criar pedido e abrir WhatsApp" })).toBeInTheDocument();
  });
});
