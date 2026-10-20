import { buildMenuCategories, type MenuCategory } from "@/lib/menuCategories";
import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

/** O cabeçalho aparece em todas as páginas: as categorias são recalculadas no máximo a cada 10 minutos. */
const TTL_MS = 10 * 60_000;
let cached: { at: number; categories: MenuCategory[] } | null = null;

export async function getMenuCategories(now = Date.now()): Promise<MenuCategory[]> {
  if (cached && now - cached.at < TTL_MS) return cached.categories;
  try {
    const categories = buildMenuCategories(groupAvailableProducts((await getLocalCatalog()).products));
    cached = { at: now, categories };
    return categories;
  } catch {
    // Sem catálogo (fornecedor fora do ar na 1ª carga): "Brindes" fica só como link.
    return cached?.categories ?? [];
  }
}
