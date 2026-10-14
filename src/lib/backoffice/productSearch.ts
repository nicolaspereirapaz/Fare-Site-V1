import { colorGroupOf } from "@/lib/colorGroups";
import type { SupplierId } from "@/lib/xbz";

/**
 * Filtros, ordem e paginação da busca de produto da equipe (janela "Escolha o produto").
 * Trabalha sobre o CUSTO do fornecedor e o estoque por cor — só a equipe vê; nunca vai ao site.
 * A busca por texto (relevância) é feita antes, por `queryCatalog`; aqui a ordem recebida é a relevância.
 */

export const STAFF_SORTS = ["relevancia", "menor-custo", "maior-custo", "mais-estoque", "nome"] as const;
export type StaffSort = (typeof STAFF_SORTS)[number];
export const STAFF_SORT_LABELS: Record<StaffSort, string> = {
  relevancia: "Relevância",
  "menor-custo": "Menor custo",
  "maior-custo": "Maior custo",
  "mais-estoque": "Mais estoque",
  nome: "Nome (A–Z)",
};

const SUPPLIERS: readonly SupplierId[] = ["xbz", "spot", "asia"];
export const STAFF_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

export type StaffFilters = {
  query: string;
  supplier: SupplierId | "";
  colorGroup: string;
  category: string;
  minCost: number | null;
  maxCost: number | null;
  minStock: number | null;
  sort: StaffSort;
  page: number;
  pageSize: number;
};

function nonNegative(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.trim().replace(/\./g, (dot, _offset, all: string) => (all.includes(",") ? "" : dot)).replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function parseStaffFilters(params: URLSearchParams): StaffFilters {
  const supplier = params.get("fornecedor") ?? "";
  const sort = params.get("ordem") ?? "";
  const minStock = nonNegative(params.get("estoqueMin"));
  return {
    query: (params.get("q") ?? "").trim().slice(0, 80),
    supplier: (SUPPLIERS as readonly string[]).includes(supplier) ? (supplier as SupplierId) : "",
    colorGroup: (params.get("cor") ?? "").trim().slice(0, 40),
    category: (params.get("categoria") ?? "").trim().slice(0, 80),
    minCost: nonNegative(params.get("custoMin")),
    maxCost: nonNegative(params.get("custoMax")),
    minStock: minStock ? Math.floor(minStock) : null,
    sort: (STAFF_SORTS as readonly string[]).includes(sort) ? (sort as StaffSort) : "relevancia",
    page: positiveInt(params.get("pagina"), 1, 100_000),
    pageSize: positiveInt(params.get("porPagina"), STAFF_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

export type StaffEntry<T> = {
  ref: T;
  name: string;
  supplier: SupplierId;
  category: string;
  variants: Array<{ label: string; cost: number; stock: number }>;
};

/** Cores que atendem aos filtros: menor custo e estoque somado delas (o que o card mostra). */
export type StaffMatch = { cost: number; stock: number; colors: number };

export type StaffBrowseResult<T> = {
  items: Array<{ ref: T; match: StaffMatch }>;
  total: number;
  page: number;
  pages: number;
  /** Produtos por grupo de cor com os demais filtros aplicados (o select mostra a contagem). */
  colorCounts: Record<string, number>;
};

type Variant = StaffEntry<unknown>["variants"][number];

function variantPasses(variant: Variant, filters: StaffFilters) {
  if (variant.cost <= 0) return false;
  if (filters.minStock !== null && variant.stock < filters.minStock) return false;
  if (filters.minCost !== null && variant.cost < filters.minCost) return false;
  if (filters.maxCost !== null && variant.cost > filters.maxCost) return false;
  return true;
}

export function browseStaffCatalog<T>(entries: StaffEntry<T>[], filters: StaffFilters): StaffBrowseResult<T> {
  const colorCounts: Record<string, number> = {};
  const matched: Array<{ entry: StaffEntry<T>; match: StaffMatch; index: number }> = [];

  entries.forEach((entry, index) => {
    if (filters.supplier && entry.supplier !== filters.supplier) return;
    if (filters.category && entry.category !== filters.category) return;
    // Estoque e custo valem por cor (estoque não soma entre cores).
    const passing = entry.variants.filter((variant) => variantPasses(variant, filters));
    if (!passing.length) return;
    const groups = new Set(passing.map((variant) => colorGroupOf(variant.label)));
    for (const group of groups) colorCounts[group] = (colorCounts[group] ?? 0) + 1;
    const inColor = filters.colorGroup ? passing.filter((variant) => colorGroupOf(variant.label) === filters.colorGroup) : passing;
    if (!inColor.length) return;
    matched.push({
      entry,
      index,
      match: {
        cost: Math.min(...inColor.map((variant) => variant.cost)),
        stock: inColor.reduce((sum, variant) => sum + variant.stock, 0),
        colors: inColor.length,
      },
    });
  });

  const byRelevance = (a: (typeof matched)[number], b: (typeof matched)[number]) => a.index - b.index;
  switch (filters.sort) {
    case "menor-custo":
      matched.sort((a, b) => a.match.cost - b.match.cost || byRelevance(a, b));
      break;
    case "maior-custo":
      matched.sort((a, b) => b.match.cost - a.match.cost || byRelevance(a, b));
      break;
    case "mais-estoque":
      matched.sort((a, b) => b.match.stock - a.match.stock || byRelevance(a, b));
      break;
    case "nome":
      matched.sort((a, b) => a.entry.name.localeCompare(b.entry.name, "pt-BR", { sensitivity: "base" }) || byRelevance(a, b));
      break;
    default:
      break;
  }

  const total = matched.length;
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const start = (page - 1) * filters.pageSize;
  return {
    items: matched.slice(start, start + filters.pageSize).map(({ entry, match }) => ({ ref: entry.ref, match })),
    total,
    page,
    pages,
    colorCounts,
  };
}
