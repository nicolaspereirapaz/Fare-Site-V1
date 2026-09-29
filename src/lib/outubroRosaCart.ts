import type { QuoteCartItem } from "@/lib/commerce";

/** Carrinho próprio da campanha, isolado do carrinho geral do site. */
export const OUTUBRO_ROSA_CART_KEY = "farefoto-outubro-rosa-cart-v1";
export const OUTUBRO_ROSA_CART_ANCHOR = "/campanhas/outubro-rosa#carrinho-outubro-rosa";

export type CampaignCartItem = QuoteCartItem & { image: string };

export function newCartItemId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readCampaignCart(): CampaignCartItem[] {
  try {
    const stored = window.localStorage.getItem(OUTUBRO_ROSA_CART_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? (parsed as CampaignCartItem[]) : [];
  } catch {
    return [];
  }
}

export function writeCampaignCart(items: CampaignCartItem[]) {
  try {
    window.localStorage.setItem(OUTUBRO_ROSA_CART_KEY, JSON.stringify(items));
  } catch {
    /* armazenamento indisponível */
  }
}

export function appendCampaignCartItem(item: Omit<CampaignCartItem, "id">): CampaignCartItem[] {
  const next = [...readCampaignCart(), { ...item, id: newCartItemId() }];
  writeCampaignCart(next);
  return next;
}
