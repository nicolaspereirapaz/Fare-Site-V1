import type { QuoteCartItem } from "@/lib/commerce";
import { unitPriceForQuantity, type CampaignQuantityPricing } from "@/lib/campaignPricing";

/** Carrinho próprio da campanha, isolado do carrinho geral do site. */
export const OUTUBRO_ROSA_CART_KEY = "farefoto-outubro-rosa-cart-v1";
export const OUTUBRO_ROSA_CART_PATH = "/campanhas/outubro-rosa/carrinho";
/** Evento disparado a cada gravação, para o contador do cabeçalho se atualizar. */
export const OUTUBRO_ROSA_CART_EVENT = "outubro-rosa-cart-change";

export type CampaignCartItem = QuoteCartItem & {
  image: string;
  /** Cor escolhida; itens antigos guardavam só em selections.Cor. */
  color?: string;
  /**
   * Preço de venda por unidade e frete a ratear (sem o custo do fornecedor), para
   * recalcular o valor quando a quantidade muda no carrinho.
   */
  pricing?: CampaignQuantityPricing | null;
};

export type NewCampaignCartItem = Omit<CampaignCartItem, "id">;

export function newCartItemId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCartItem(value: unknown): value is CampaignCartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CampaignCartItem>;
  return typeof item.id === "string" && typeof item.productName === "string"
    && typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity >= 1;
}

export function readCampaignCart(): CampaignCartItem[] {
  try {
    const stored = window.localStorage.getItem(OUTUBRO_ROSA_CART_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter(isCartItem) : [];
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
  window.dispatchEvent(new Event(OUTUBRO_ROSA_CART_EVENT));
}

export function cartItemColor(item: CampaignCartItem): string {
  return item.color ?? item.selections.Cor ?? item.selections["Variação"] ?? "";
}

/** Mesmo produto na mesma cor vira uma linha só (as quantidades somam). */
export function mergeCartItem(cart: CampaignCartItem[], item: NewCampaignCartItem): CampaignCartItem[] {
  const color = item.color ?? item.selections.Cor ?? "";
  const existing = cart.find((entry) => entry.slug === item.slug && cartItemColor(entry) === color);
  if (!existing) return [...cart, { ...item, id: newCartItemId() }];
  return cart.map((entry) => (entry.id === existing.id
    ? { ...entry, ...item, id: entry.id, quantity: entry.quantity + item.quantity }
    : entry));
}

export function appendCampaignCartItem(item: NewCampaignCartItem): CampaignCartItem[] {
  const next = mergeCartItem(readCampaignCart(), item);
  writeCampaignCart(next);
  return next;
}

/** Valor unitário estimado para a quantidade atual da linha (null = sob consulta). */
export function cartItemUnitPrice(item: CampaignCartItem): number | null {
  return item.pricing ? unitPriceForQuantity(item.pricing, item.quantity) : null;
}

export function cartItemSubtotal(item: CampaignCartItem): number | null {
  const unit = cartItemUnitPrice(item);
  return unit === null ? null : Math.round(unit * item.quantity * 100) / 100;
}

export type CartSummary = { lines: number; units: number; total: number; hasUnpriced: boolean };

export function summarizeCart(cart: CampaignCartItem[]): CartSummary {
  return cart.reduce<CartSummary>((summary, item) => {
    const subtotal = cartItemSubtotal(item);
    return {
      lines: summary.lines + 1,
      units: summary.units + item.quantity,
      total: Math.round((summary.total + (subtotal ?? 0)) * 100) / 100,
      hasUnpriced: summary.hasUnpriced || subtotal === null,
    };
  }, { lines: 0, units: 0, total: 0, hasUnpriced: false });
}