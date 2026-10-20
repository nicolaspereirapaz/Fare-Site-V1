import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, requestCheckout, cart, updateQuantity, fetchMyProfile, saveMyContact } = vi.hoisted(() => ({
  push: vi.fn(),
  requestCheckout: vi.fn(),
  cart: { items: [] as unknown[] },
  updateQuantity: vi.fn(),
  fetchMyProfile: vi.fn(),
  saveMyContact: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ items: cart.items, removeItem: vi.fn(), updateQuantity }),
}));
vi.mock("@/lib/requestCheckout", () => ({ requestCheckout }));
vi.mock("@/lib/account/profileClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/account/profileClient")>()),
  fetchMyProfile,
  saveMyContact,
}));

import { EMPTY_PROFILE } from "@/lib/account/profile";
import { CartView } from "@/components/CartView";
import { photoStore } from "@/components/fotos/store";
import type { Photo } from "@/components/fotos/shared";

const PHOTO_ITEM = {
  id: "item-1", productName: "Foto 10x15", slug: "foto-10x15", quantity: 1,
  selections: {}, artworkName: null, unitPrice: null, image: "/foto.jpg",
};

function photo(id: string, patch: Partial<Photo> = {}): Photo {
  return {
    id, name: `${id}.jpg`, url: `/${id}.jpg`, w: 1200, h: 1800, sizeId: "10x15", paper: "brilho", copies: 1,
    fit: "preencher", landscape: false, zoom: 1, x: 0.5, y: 0.5, border: 0, filter: "original", filterStrength: 100,
    brightness: 0, contrast: 0, saturation: 0, uploadId: `envio-${id}`, upload: { status: "pronto", progress: 1 }, ...patch,
  };
}

describe("CartView", () => {
  beforeEach(() => {
    push.mockReset();
    requestCheckout.mockReset();
    requestCheckout.mockResolvedValue({ requiresAuth: true });
    updateQuantity.mockReset();
    fetchMyProfile.mockReset();
    // Cliente logado com nome e WhatsApp do cadastro (o carrinho não pede de novo).
    fetchMyProfile.mockResolvedValue({ ...EMPTY_PROFILE, name: "Ana", email: "ana@x.com", phone: "(11) 99999-9999", complete: false });
    saveMyContact.mockReset();
    saveMyContact.mockResolvedValue(null);
    cart.items = [PHOTO_ITEM];
    photoStore.set({ photos: [], inCart: false });
  });

  it("usa nome e WhatsApp do cadastro, sem campos para digitar", async () => {
    fetchMyProfile.mockResolvedValue({ ...EMPTY_PROFILE, personType: "pj", name: "Ana Silva", email: "ana@x.com", phone: "(11) 98888-7777", companyName: "Loja A Ltda", tradeName: "Loja A", complete: true });
    render(<CartView />);
    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText(/\(11\) 98888-7777/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Nome/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alterar no cadastro" })).toHaveAttribute("href", "/minha-conta/dados");
  });

  it("conta antiga sem WhatsApp: pede só o telefone, salva no cadastro e finaliza", async () => {
    fetchMyProfile.mockResolvedValue({ ...EMPTY_PROFILE, name: "Ana", email: "ana@x.com", phone: "", complete: false });
    requestCheckout.mockResolvedValue({ url: "https://wa.me/x" });
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, assign } });
    const user = userEvent.setup();
    render(<CartView />);
    await user.type(await screen.findByRole("textbox", { name: /Seu WhatsApp/ }), "11988887777");
    expect(screen.queryByRole("textbox", { name: /Nome/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar no WhatsApp" }));
    await waitFor(() => expect(saveMyContact).toHaveBeenCalledWith({ phone: "(11) 98888-7777" }));
    await waitFor(() => expect(requestCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ customer: expect.objectContaining({ name: "Ana", phone: "(11) 98888-7777" }) }), expect.anything(), "/api/quotes",
    ));
  });

  it("sem login: leva para entrar (nome e WhatsApp vêm do cadastro)", async () => {
    fetchMyProfile.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<CartView />);
    expect(await screen.findByText(/entre na sua conta/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar no WhatsApp" }));
    expect(push).toHaveBeenCalledWith("/entrar?callbackURL=/carrinho");
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

  it("finaliza só com retirada ou entrega: sem pagamento nem faturamento", () => {
    render(<CartView />);
    expect(screen.getByRole("radio", { name: /Retirar na loja/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Receber em casa/ })).not.toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Forma de pagamento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Fazer pedido/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Faturar para" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finalizar no WhatsApp" })).toBeEnabled();
  });

  it("com brindes, registra o orçamento e leva a entrega escolhida na mensagem", async () => {
    const user = userEvent.setup();
    render(<CartView />);

    await user.click(screen.getByRole("radio", { name: /Receber em casa/ }));
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar no WhatsApp" }));

    expect(requestCheckout).toHaveBeenCalledTimes(1);
    const [payload, , endpoint] = requestCheckout.mock.calls[0];
    expect(endpoint).toBe("/api/quotes");
    expect(payload).not.toHaveProperty("paymentMethod");
    expect(payload).toMatchObject({
      customer: { name: "Ana", phone: "(11) 99999-9999", notes: expect.stringContaining("receber em casa") },
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/),
    });
    expect(push).toHaveBeenCalledWith("/entrar?callbackURL=/carrinho");
  });

  it("mostra o pedido de fotos junto com os brindes e manda o pedido de fotos junto no orçamento", async () => {
    photoStore.set({ photos: [photo("a"), photo("b"), photo("c", { copies: 3 })], inCart: true });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: "PED-ABC123", url: "#whatsapp", summary: ["Pedido de fotos PED-ABC123:", "• Revelação 10 × 15 cm — papel Brilho", "  3 fotos · 5 cópias · R$ 17,50 (R$ 3,50 cada)"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CartView />);

    expect(screen.getByRole("heading", { name: "Revelação 10 × 15 cm" })).toBeInTheDocument();
    expect(screen.getByText("2 itens")).toBeInTheDocument();
    // 5 cópias de 10 × 15 = R$ 3,50 cada
    expect(screen.getByText(/Subtotal R\$\s17,50/)).toBeInTheDocument();

    expect(await screen.findByText("Ana")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar no WhatsApp" }));

    // 1) o servidor monta a pasta do pedido de fotos com o que foi enviado e as escolhas do editor
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/fotos/pedidos");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ delivery: "retirada", customer: { name: "Ana", phone: "(11) 99999-9999" } });
    expect(body.photos).toHaveLength(3);
    expect(body.photos[2]).toMatchObject({ uploadId: "envio-c", sizeId: "10x15", paper: "brilho", copies: 3 });
    // 2) o orçamento dos brindes leva o pedido de fotos nas observações
    const [payload] = requestCheckout.mock.calls[0];
    expect(payload.customer.notes).toContain("vou retirar na loja");
    expect(payload.customer.notes).toContain("Pedido de fotos PED-ABC123:");
    vi.unstubAllGlobals();
  });

  it("só com fotos, monta o pedido no servidor e não cria orçamento", async () => {
    cart.items = [];
    photoStore.set({ photos: [photo("a")], inCart: true });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: "PED-ABC123", url: "#whatsapp", summary: ["Pedido de fotos PED-ABC123:", "• Revelação 10 × 15 cm — papel Brilho", "  3 fotos · 5 cópias · R$ 17,50 (R$ 3,50 cada)"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CartView />);

    expect(await screen.findByText("Ana")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar no WhatsApp" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestCheckout).not.toHaveBeenCalled();
    // pedido enviado: as fotos saem do carrinho
    expect(photoStore.get().photos).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("pede para entrar na conta quando o pedido de fotos precisa de login", async () => {
    cart.items = [];
    photoStore.set({ photos: [photo("a")], inCart: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Entre" }), { status: 401 })));
    const user = userEvent.setup();
    render(<CartView />);

    expect(await screen.findByText("Ana")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar no WhatsApp" }));

    expect(push).toHaveBeenCalledWith("/entrar?callbackURL=/carrinho");
    // as fotos continuam no carrinho para depois do login
    expect(photoStore.get().photos).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("espera as fotos terminarem de subir antes de finalizar", () => {
    cart.items = [];
    photoStore.set({ photos: [photo("a"), photo("b", { uploadId: undefined, upload: { status: "enviando", progress: 0.4 } })], inCart: true });
    render(<CartView />);
    const button = screen.getByRole("button", { name: /Enviando fotos para a loja \(faltam 1\)/ });
    expect(button).toBeDisabled();
  });

  it("carrinho vazio convida a enviar fotos ou ver brindes", () => {
    cart.items = [];
    render(<CartView />);
    expect(screen.getByRole("link", { name: "Enviar minhas fotos" })).toHaveAttribute("href", "/produtos/revelacao-de-fotos");
    expect(screen.getByRole("link", { name: "Ver brindes" })).toHaveAttribute("href", "/brindes");
  });
});
