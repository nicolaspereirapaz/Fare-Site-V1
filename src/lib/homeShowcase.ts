import type { CatalogProduct } from "@/lib/xbz";

/** Dados da Home montados a partir do catálogo real do fornecedor (fotos e categorias reais). */
export type HomeCategory = { name: string; count: number; imageUrl: string };
export type HomeShowcase = { total: number; categories: HomeCategory[]; featured: CatalogProduct[]; hero: CatalogProduct[] };

const HIDDEN_CATEGORIES = new Set(["Outros"]);

/** Categorias que rendem as melhores fotos de banner (objetos com volume e cor); as outras completam se faltar. */
export const HERO_CATEGORIES = ["Garrafas e Squeezes", "Mochilas", "Canecas, Copos e Taças", "Kits Executivos", "Churrasco, Vinho e Queijo"];

const byStock = (a: CatalogProduct, b: CatalogProduct) => b.totalStock - a.totalStock || a.name.localeCompare(b.name, "pt-BR");

/** Um de cada categoria por vez, até o limite (pula o que já foi usado em outra seção). */
function roundRobin(queues: CatalogProduct[][], limit: number, used: Set<string>) {
  const picked: CatalogProduct[] = [];
  while (picked.length < limit && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      let next = queue.shift();
      while (next && used.has(next.id)) next = queue.shift();
      if (next) {
        picked.push(next);
        used.add(next.id);
      }
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

/**
 * - categorias: as que têm mais produtos (sem "Outros"), cada uma com a foto do item de maior estoque;
 * - destaques: alterna entre as categorias, só com foto, maior estoque primeiro, sem repetir a capa das categorias;
 * - hero: 4 fotos que não aparecem nem nas categorias nem nos destaques (a Home não repete imagem).
 */
const rank = (name: string) => {
  const index = HERO_CATEGORIES.indexOf(name);
  return index === -1 ? HERO_CATEGORIES.length : index;
};

export function buildHomeShowcase(
  products: CatalogProduct[],
  { categoryLimit = 6, featuredLimit = 8, heroLimit = 5 }: { categoryLimit?: number; featuredLimit?: number; heroLimit?: number } = {},
): HomeShowcase {
  const groups = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    if (HIDDEN_CATEGORIES.has(product.category)) continue;
    const list = groups.get(product.category) ?? [];
    list.push(product);
    groups.set(product.category, list);
  }

  const ranked = [...groups.entries()]
    .map(([name, list]) => ({ name, count: list.length, withPhoto: list.filter((item) => item.imageUrl).sort(byStock) }))
    .filter((group) => group.withPhoto.length > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));

  const used = new Set<string>();
  const categories = ranked.slice(0, categoryLimit).map((group) => {
    used.add(group.withPhoto[0].id);
    return { name: group.name, count: group.count, imageUrl: group.withPhoto[0].imageUrl };
  });

  const featured = roundRobin(ranked.map((group) => [...group.withPhoto]), featuredLimit, used);
  const heroFirst = [...ranked].sort((a, b) => rank(a.name) - rank(b.name));
  const hero = roundRobin(heroFirst.map((group) => [...group.withPhoto]), heroLimit, used);

  return { total: products.length, categories, featured, hero };
}
