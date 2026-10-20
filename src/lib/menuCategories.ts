import type { CatalogProduct } from "@/lib/xbz";

/** Categorias do menu "Brindes" do cabeçalho. */
export type MenuCategory = { name: string; count: number };

const HIDDEN_CATEGORIES = new Set(["Outros"]);

/** Maiores categorias primeiro (sem "Outros", como na Home). */
export function buildMenuCategories(products: CatalogProduct[]): MenuCategory[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (HIDDEN_CATEGORIES.has(product.category)) continue;
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
}
