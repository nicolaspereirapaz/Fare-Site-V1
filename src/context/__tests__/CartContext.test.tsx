import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { CartProvider, useCart } from "@/context/CartContext";

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>;

async function mount() {
  const hook = renderHook(() => useCart(), { wrapper });
  // o provedor lê o localStorage num setTimeout(0)
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  return hook;
}

describe("CartContext — preço de brinde por quantidade", () => {
  beforeEach(() => window.localStorage.clear());

  it("recalcula o valor por unidade ao mudar a quantidade (frete rateado)", async () => {
    const { result } = await mount();
    act(() => result.current.addItem({
      productName: "Caneta", slug: "brindes/x", quantity: 100, selections: {}, artworkName: null,
      unitPrice: 2.64, image: "/c.jpg", pricing: { unitSaleCents: 164, freightCents: 10000 },
    }));
    const id = result.current.items[0].id;

    act(() => result.current.updateQuantity(id, 300));
    expect(result.current.items[0]).toMatchObject({ quantity: 300, unitPrice: 1.97 });

    act(() => result.current.updateQuantity(id, 50));
    expect(result.current.items[0]).toMatchObject({ quantity: 50, unitPrice: 3.64 });
  });

  it("não altera o valor de itens sem parâmetros de preço", async () => {
    const { result } = await mount();
    act(() => result.current.addItem({
      productName: "Foto", slug: "foto", quantity: 1, selections: {}, artworkName: null, unitPrice: null, image: "/f.jpg",
    }));
    act(() => result.current.updateQuantity(result.current.items[0].id, 5));
    expect(result.current.items[0]).toMatchObject({ quantity: 5, unitPrice: null });
  });

  it("soma a quantidade quando o mesmo brinde e cor são adicionados de novo (sem linha duplicada)", async () => {
    const { result } = await mount();
    const caneta = {
      productName: "Caneta", slug: "brindes/x", selections: { "Variação": "Azul" }, artworkName: null,
      image: "/c.jpg", pricing: { unitSaleCents: 164, freightCents: 10000 },
    };
    act(() => result.current.addItem({ ...caneta, quantity: 100, unitPrice: 2.64 }));
    act(() => result.current.addItem({ ...caneta, quantity: 200, unitPrice: 2.14 }));
    act(() => result.current.addItem({ ...caneta, selections: { "Variação": "Verde" }, quantity: 50, unitPrice: 3.64 }));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]).toMatchObject({ quantity: 300, unitPrice: 1.97 });
    expect(result.current.items[1]).toMatchObject({ quantity: 50, selections: { "Variação": "Verde" } });
  });
});