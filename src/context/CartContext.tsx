"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { QuoteCartItem } from "@/lib/commerce";
import { unitPriceForQuantity } from "@/lib/campaignPricing";

export type CartItem = QuoteCartItem & {
  image: string;
};

type AddCartItem = Omit<CartItem, "id">;

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (item: AddCartItem) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
};

const STORAGE_KEY = "farefoto-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

/** Mesmo brinde + mesmas escolhas (cor) = mesma linha. Produtos próprios mantêm uma linha por configuração. */
function sameGiftLine(a: Pick<CartItem, "slug" | "selections" | "pricing">, b: Pick<CartItem, "slug" | "selections" | "pricing">) {
  return Boolean(a.pricing && b.pricing)
    && a.slug === b.slug
    && JSON.stringify(a.selections) === JSON.stringify(b.selections);
}

function readStoredCart(): CartItem[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(readStoredCart());
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, storageReady]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: items.length,
      addItem: (item) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        setItems((current) => {
          const existing = current.find((line) => sameGiftLine(line, item));
          if (!existing || !item.pricing) return [...current, { ...item, id }];
          // Soma a quantidade e recalcula o valor por unidade (frete rateado sobre o novo total).
          const quantity = existing.quantity + item.quantity;
          return current.map((line) => line.id === existing.id
            ? { ...line, ...item, id: line.id, quantity, unitPrice: unitPriceForQuantity(item.pricing!, quantity) }
            : line);
        });
      },
      removeItem: (id) => {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      updateQuantity: (id, quantity) => {
        setItems((current) =>
          current.map((item) => {
            if (item.id !== id) return item;
            const nextQuantity = Math.max(1, quantity);
            // Brinde: o frete do fornecedor é rateado, então o valor por unidade muda com a quantidade.
            const unitPrice = item.pricing ? unitPriceForQuantity(item.pricing, nextQuantity) : item.unitPrice;
            return { ...item, quantity: nextQuantity, unitPrice };
          }),
        );
      },
      clearCart: () => setItems([]),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
