import { campaignQuantityPricing, CAMPAIGN_REFERENCE_QUANTITY, unitPriceForQuantity } from "@/lib/campaignPricing";
import type { CatalogProduct } from "@/lib/xbz";

/**
 * Busca, filtros e ordenação do catálogo de brindes (no servidor, sobre o catálogo inteiro).
 * O preço considerado é o preço final por unidade para a quantidade pedida (100 un. por padrão),
 * pela mesma regra da página do produto e do pedido. Filtro e ordem por preço só para cadastrados.
 */
export const CATALOG_SORTS = ["relevancia", "menor-preco", "maior-preco", "mais-cores", "nome"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const SORT_LABELS: Record<CatalogSort, string> = {
  relevancia: "Mais relevantes",
  "menor-preco": "Menor preço",
  "maior-preco": "Maior preço",
  "mais-cores": "Mais opções de cor",
  nome: "Nome (A–Z)",
};

export const PRICE_SORTS: ReadonlySet<CatalogSort> = new Set(["menor-preco", "maior-preco"]);
export const MAX_QUANTITY = 100_000;

export type CatalogQuery = {
  query: string;
  category: string;
  quantity: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  sort: CatalogSort;
  pricesVisible: boolean;
};

function positiveNumber(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.trim().replace(/\./g, (match, offset, all) => (all.includes(",") ? "" : match)).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseCatalogParams(params: URLSearchParams, pricesVisible: boolean): CatalogQuery {
  const quantity = Number.parseInt(params.get("qtd") ?? "", 10);
  const sort = (CATALOG_SORTS as readonly string[]).includes(params.get("ordem") ?? "") ? (params.get("ordem") as CatalogSort) : "relevancia";
  return {
    query: (params.get("q") ?? "").trim().toLocaleLowerCase("pt-BR"),
    category: (params.get("categoria") ?? "").trim(),
    quantity: Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, MAX_QUANTITY) : null,
    minPrice: pricesVisible ? positiveNumber(params.get("precoMin")) : null,
    maxPrice: pricesVisible ? positiveNumber(params.get("precoMax")) : null,
    sort: !pricesVisible && PRICE_SORTS.has(sort) ? "relevancia" : sort,
    pricesVisible,
  };
}

/** Preço final por unidade para a quantidade (mesma regra do pedido); null = sob consulta. */
export function unitPriceFor(product: CatalogProduct, quantity: number | null): number | null {
  const pricing = campaignQuantityPricing(product);
  return pricing ? unitPriceForQuantity(pricing, quantity ?? CAMPAIGN_REFERENCE_QUANTITY) : null;
}

/** Tem estoque para a quantidade em pelo menos uma cor (estoque não soma entre cores). */
export function hasStockFor(product: CatalogProduct, quantity: number | null): boolean {
  return quantity === null || product.variants.some((variant) => variant.stockAvailable >= quantity);
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

/** Pontuação da busca: nome vale mais que categoria/cores, que valem mais que descrição. */
function searchScore(product: CatalogProduct, words: string[], extra: string): number {
  const name = normalizeSearch(product.name);
  const category = normalizeSearch(product.category);
  const colors = normalizeSearch(product.colors.join(" "));
  const description = normalizeSearch(product.description);
  const code = normalizeSearch(extra);
  let score = 0;
  for (const word of words) {
    if (code && code === word) score += 100;
    else if (name.startsWith(word)) score += 30;
    else if (new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(name)) score += 20;
    else if (name.includes(word)) score += 12;
    else if (category.includes(word) || colors.includes(word)) score += 6;
    else if (description.includes(word)) score += 2;
    else return 0; // toda palavra precisa aparecer em algum lugar
  }
  return score;
}

/** Destaque sem busca: mais cores e mais estoque primeiro (dentro da categoria). */
function highlightScore(product: CatalogProduct): number {
  return Math.min(product.variants.length, 8) * 10 + Math.log10(1 + product.totalStock) * 5;
}

/** Intercala categorias (uma de cada por vez) para a 1ª página mostrar variedade. */
function interleaveByCategory(products: CatalogProduct[]): CatalogProduct[] {
  const groups = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    const list = groups.get(product.category) ?? [];
    list.push(product);
    groups.set(product.category, list);
  }
  const queues = [...groups.values()]
    .map((list) => list.sort((a, b) => highlightScore(b) - highlightScore(a)))
    .sort((a, b) => b.length - a.length);
  const result: CatalogProduct[] = [];
  for (let round = 0; result.length < products.length; round += 1) {
    for (const queue of queues) if (queue[round]) result.push(queue[round]);
  }
  return result;
}

/** Só o filtro (sem ordenar): para contar produtos por categoria sem pagar a ordenação. */
export function filterCatalog(
  products: CatalogProduct[],
  query: CatalogQuery,
  searchCodeOf: (product: CatalogProduct) => string = () => "",
): CatalogProduct[] {
  return queryCatalog(products, query, searchCodeOf, false);
}

export function queryCatalog(
  products: CatalogProduct[],
  query: CatalogQuery,
  searchCodeOf: (product: CatalogProduct) => string = () => "",
  sorted = true,
): CatalogProduct[] {
  const words = normalizeSearch(query.query).split(/\s+/).filter(Boolean);
  const priceFilter = query.pricesVisible && (query.minPrice !== null || query.maxPrice !== null);
  const scores = new Map<CatalogProduct, number>();
  const prices = new Map<CatalogProduct, number | null>();

  const filtered = products.filter((product) => {
    if (query.category && product.category !== query.category) return false;
    if (!hasStockFor(product, query.quantity)) return false;
    if (words.length) {
      const score = searchScore(product, words, searchCodeOf(product));
      if (!score) return false;
      scores.set(product, score);
    }
    if (priceFilter) {
      const price = unitPriceFor(product, query.quantity);
      if (price === null) return false;
      if (query.minPrice !== null && price < query.minPrice) return false;
      if (query.maxPrice !== null && price > query.maxPrice) return false;
      prices.set(product, price);
    }
    return true;
  });
  if (!sorted) return filtered;

  const priceOf = (product: CatalogProduct) => {
    if (!prices.has(product)) prices.set(product, unitPriceFor(product, query.quantity));
    return prices.get(product) ?? null;
  };
  const byRelevance = (a: CatalogProduct, b: CatalogProduct) =>
    (scores.get(b) ?? 0) - (scores.get(a) ?? 0) || highlightScore(b) - highlightScore(a);
  const byPrice = (direction: 1 | -1) => (a: CatalogProduct, b: CatalogProduct) => {
    const pa = priceOf(a);
    const pb = priceOf(b);
    if (pa === null || pb === null) return pa === pb ? byRelevance(a, b) : pa === null ? 1 : -1;
    return (pa - pb) * direction || byRelevance(a, b);
  };

  switch (PRICE_SORTS.has(query.sort) && !query.pricesVisible ? "relevancia" : query.sort) {
    case "menor-preco":
      return filtered.sort(byPrice(1));
    case "maior-preco":
      return filtered.sort(byPrice(-1));
    case "mais-cores":
      return filtered.sort((a, b) => b.variants.length - a.variants.length || byRelevance(a, b));
    case "nome":
      return filtered.sort((a, b) => normalizeSearch(a.name).localeCompare(normalizeSearch(b.name), "pt-BR"));
    default:
      return words.length ? filtered.sort(byRelevance) : interleaveByCategory(filtered);
  }
}
