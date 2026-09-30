import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { addItem, updateQuantity, push, cart } = vi.hoisted(() => ({
  addItem: vi.fn(),
  updateQuantity: vi.fn(),
  push: vi.fn(),
  cart: { items: [] as unknown[] },
}));
vi.mock("@/context/CartContext", () => ({ useCart: () => ({ addItem, updateQuantity, items: cart.items }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { alt, src } = props as { alt: string; src: string };
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

import { XbzProductDetail } from "@/components/XbzProductDetail";

const payload = {
  product: {
    publicId: "abc", name: "CANECA ACRÍLICA", description: "Caneca", imageUrl: "/azul.jpg",
    category: "Canecas", subcategory: "", colors: ["AZUL", "VERDE"],
    variants: [
      { publicId: "v1", label: "Azul", imageUrl: "/azul.jpg" },
      { publicId: "v2", label: "Verde", imageUrl: "/verde.jpg" },
    ],
    startingPrice: 2.64,
  },
  pricesVisible: true,
  priceTiers: [{ quantity: 50, unitPrice: 3.64 }, { quantity: 100, unitPrice: 2.64 }],
  quantityPricing: { unitSaleCents: 164, freightCents: 10000 },
  meta: { fetchedAt: "", cached: true },
};

describe("página do brinde", () => {
  beforeEach(() => {
    addItem.mockReset();
    updateQuantity.mockReset();
    push.mockReset();
    cart.items = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
  });

  it("não tem mais o campo 'Enviar arte agora'", async () => {
    render(<XbzProductDetail code="abc" />);
    await screen.findByRole("img", { name: /Caneca Acrílica — Azul/ });
    expect(screen.queryByLabelText(/Enviar arte/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enviar arte agora/)).not.toBeInTheDocument();
  });

  it("tem os botões 'Finalizar pedido' e 'Adicionar ao carrinho'", async () => {
    render(<XbzProductDetail code="abc" />);
    expect(await screen.findByRole("button", { name: /Finalizar pedido/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar ao carrinho/ })).toBeInTheDocument();
  });

  it("ao adicionar, mostra um aviso discreto com produto, cor e quantidade", async () => {
    const user = userEvent.setup();
    render(<XbzProductDetail code="abc" />);
    await user.click(await screen.findByRole("button", { name: /Adicionar ao carrinho/ }));

    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Adicionado ao carrinho");
    expect(toast).toHaveTextContent(/Caneca Acrílica · Azul · 100 un\./);
    expect(screen.getByRole("link", { name: /Ver carrinho/ })).toHaveAttribute("href", "/carrinho");
  });

  it("'Finalizar pedido' adiciona e vai direto ao formulário do carrinho", async () => {
    const user = userEvent.setup();
    render(<XbzProductDetail code="abc" />);
    await user.click(await screen.findByRole("button", { name: /Finalizar pedido/ }));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ quantity: 100 }));
    expect(push).toHaveBeenCalledWith("/carrinho#finalizar");
  });

  it("'Finalizar pedido' não duplica: se o mesmo brinde e cor já estão no carrinho, só ajusta a quantidade", async () => {
    cart.items = [{ id: "linha-1", slug: "brindes/abc", selections: { "Variação": "Azul" }, quantity: 40 }];
    const user = userEvent.setup();
    render(<XbzProductDetail code="abc" />);
    await user.click(await screen.findByRole("button", { name: /Finalizar pedido/ }));
    expect(addItem).not.toHaveBeenCalled();
    expect(updateQuantity).toHaveBeenCalledWith("linha-1", 100);
    expect(push).toHaveBeenCalledWith("/carrinho#finalizar");
  });

  it("mostra uma miniatura por cor e troca a foto principal ao clicar", async () => {
    const user = userEvent.setup();
    render(<XbzProductDetail code="abc" />);

    const main = await screen.findByRole("img", { name: /Caneca Acrílica — Azul/ });
    expect(main).toHaveAttribute("src", "/azul.jpg");
    expect(screen.getAllByRole("button", { name: /^Ver cor / })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Ver cor Verde" }));
    expect(screen.getByRole("img", { name: /Caneca Acrílica — Verde/ })).toHaveAttribute("src", "/verde.jpg");
  });

  it("mostra as fotos do fornecedor sobre fundo cinza claro, como na campanha", async () => {
    render(<XbzProductDetail code="abc" />);
    const main = await screen.findByRole("img", { name: /Caneca Acrílica — Azul/ });
    expect(main.closest(".product-main-image")).toHaveClass("supplier-photo");
    for (const thumb of screen.getAllByRole("button", { name: /^Ver cor / })) expect(thumb).toHaveClass("supplier-photo");
  });

  it("adiciona ao carrinho com a foto da cor e os parâmetros de preço para recalcular", async () => {
    const user = userEvent.setup();
    render(<XbzProductDetail code="abc" />);
    await user.click(await screen.findByRole("button", { name: "Verde" }));
    await user.click(screen.getByRole("button", { name: /Adicionar ao carrinho/ }));

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      quantity: 100,
      unitPrice: 2.64,
      image: "/verde.jpg",
      pricing: { unitSaleCents: 164, freightCents: 10000 },
      selections: expect.objectContaining({ "Variação": "Verde" }),
    }));
  });
});
