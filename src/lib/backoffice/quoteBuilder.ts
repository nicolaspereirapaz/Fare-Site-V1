import { randomUUID } from "node:crypto";
import { calcularItemOrcamento, FRETE_FORNECEDOR_PRODUTO, type Tecnica } from "@/lib/backoffice/customization";
import type { ItemCosting, QuoteCartItem } from "@/lib/commerce";
import type { SpotCustomization } from "@/lib/suppliers/spotCustomizations";
import type { SupplierId } from "@/lib/xbz";

/**
 * Orçamento montado no painel (novo ou editando um do site). O navegador manda só o rascunho
 * (produto, cor, quantidade, gravações); custo, preço e códigos são sempre calculados aqui,
 * com o catálogo do servidor. Item fora do catálogo: o custo é o que o vendedor digitou.
 */

export type BuilderProduct = {
  publicId: string;
  name: string;
  category: string;
  imageUrl: string;
  fareCode: string;
  supplier: SupplierId;
  supplierCode: string;
  variants: Array<{ label: string; cost: number; stock: number; sku: string; imageUrl: string }>;
  spotOptions: SpotCustomization[];
};

export type DraftGravacao = { tecnica: Record<string, unknown> & { tipo: string }; local: string };
export type DraftItem =
  | { id: string; source: "catalogo"; publicId: string; variant: string; quantity: number; gravacoes: DraftGravacao[] }
  | { id: string; source: "avulso"; name: string; cost: number; quantity: number; gravacoes: DraftGravacao[] };

export type ItemPreview =
  | {
    id: string;
    ok: true;
    unitPrice: number;
    total: number;
    /** Custo total do item (produto + gravações + frete do fornecedor). */
    cost: number;
    productCost: number;
    gravacoes: Array<{ descricao: string; local: string; detalhe: string; custoUnitario: number; custoTotal: number }>;
    stockWarning?: string;
  }
  | { id: string; ok: false; error: string };

export const MAX_QUOTE_ITEMS = 60;
const MAX_GRAVACOES = 10;
const GIFT_PREFIX = "brindes/";

const cents = (value: number) => Math.round(value * 100) / 100;

function toNumber(value: unknown) {
  const parsed = typeof value === "string" ? Number(value.replace(/\./g, (dot, _i, all: string) => (all.includes(",") ? "" : dot)).replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseTecnica(raw: unknown): DraftGravacao["tecnica"] {
  const body = (raw ?? {}) as Record<string, unknown>;
  switch (body.tipo) {
    case "laser":
      return { tipo: "laser" };
    case "dtf-textil":
    case "dtf-uv":
      return { tipo: body.tipo, larguraCm: toNumber(body.larguraCm), alturaCm: toNumber(body.alturaCm) };
    case "spot":
      return { tipo: "spot", opcaoId: String(body.opcaoId ?? "").slice(0, 80) };
    case "manual":
      return { tipo: "manual", nome: String(body.nome ?? "").trim().slice(0, 80), custoUnitario: toNumber(body.custoUnitario) };
    default:
      return { tipo: "nenhuma" };
  }
}

/** Valida o formato do rascunho vindo do navegador; descarta qualquer campo de preço ou custo do catálogo. */
export function parseDraftItems(raw: unknown): DraftItem[] {
  if (!Array.isArray(raw)) throw new Error("Rascunho inválido.");
  if (!raw.length) throw new Error("Adicione pelo menos um produto.");
  if (raw.length > MAX_QUOTE_ITEMS) throw new Error(`No máximo ${MAX_QUOTE_ITEMS} produtos por orçamento.`);
  return raw.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const id = String(item.id ?? "").slice(0, 64) || `item-${index + 1}`;
    const quantity = toNumber(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) throw new Error(`Item ${index + 1}: quantidade inválida.`);
    const list = Array.isArray(item.gravacoes) ? item.gravacoes : [];
    if (list.length > MAX_GRAVACOES) throw new Error(`Item ${index + 1}: no máximo ${MAX_GRAVACOES} gravações.`);
    const gravacoes = list.map((gravacao) => {
      const g = (gravacao ?? {}) as Record<string, unknown>;
      return { tecnica: parseTecnica(g.tecnica), local: String(g.local ?? "").trim().slice(0, 80) };
    });
    if (item.source === "avulso") {
      const name = String(item.name ?? "").trim().slice(0, 120);
      return { id, source: "avulso" as const, name, cost: toNumber(item.cost), quantity, gravacoes };
    }
    return {
      id,
      source: "catalogo" as const,
      publicId: String(item.publicId ?? "").slice(0, 80),
      variant: String(item.variant ?? "").slice(0, 80),
      quantity,
      gravacoes,
    };
  });
}

function resolveTecnica(tecnica: DraftGravacao["tecnica"], product: BuilderProduct | null): Tecnica {
  switch (tecnica.tipo) {
    case "laser":
      return { tipo: "laser" };
    case "dtf-textil":
    case "dtf-uv":
      return { tipo: tecnica.tipo, larguraCm: Number(tecnica.larguraCm), alturaCm: Number(tecnica.alturaCm) };
    case "spot": {
      const opcao = product?.supplier === "spot" ? product.spotOptions.find((option) => option.id === tecnica.opcaoId) : undefined;
      if (!opcao) throw new Error("Personalização da Spot só vale para produtos da Spot (escolha uma opção da lista).");
      return { tipo: "spot", opcao };
    }
    case "manual":
      return { tipo: "manual", nome: String(tecnica.nome ?? ""), custoUnitario: Number(tecnica.custoUnitario) };
    default:
      return { tipo: "nenhuma" };
  }
}

/** Monta os itens do orçamento (com preço e custo) e a prévia que a tela mostra. */
export function buildQuoteItems(
  drafts: DraftItem[],
  lookup: (publicId: string) => BuilderProduct | null,
  actor: { name: string },
  now: string = new Date().toISOString(),
) {
  const items: QuoteCartItem[] = [];
  const preview: ItemPreview[] = [];

  for (const draft of drafts) {
    try {
      const product = draft.source === "catalogo" ? lookup(draft.publicId) : null;
      if (draft.source === "catalogo" && !product) throw new Error("Este produto não está mais no catálogo.");
      if (draft.source === "avulso") {
        if (draft.name.length < 2) throw new Error("Informe o nome do item.");
        if (!(draft.cost >= 0)) throw new Error("Informe o custo por peça do item.");
      }
      const variant = product && draft.source === "catalogo" ? product.variants.find((entry) => entry.label === draft.variant) ?? null : null;
      // Nunca troca de cor sozinho: a cor escolhida pode ter saído do catálogo.
      if (product && !variant) throw new Error(product.variants.length ? `A cor "${draft.source === "catalogo" ? draft.variant : ""}" não está mais disponível. Escolha outra.` : "Produto sem cores disponíveis.");
      const productCost = variant ? variant.cost : (draft as Extract<DraftItem, { source: "avulso" }>).cost;

      const calc = calcularItemOrcamento({
        custoProduto: productCost,
        categoria: product?.category ?? "",
        quantidade: draft.quantity,
        gravacoes: draft.gravacoes.map(({ tecnica, local }) => ({ tecnica: resolveTecnica(tecnica, product), local })),
      });
      const gravacoes = calc.gravacoes.map((gravacao, index) => ({
        tecnica: draft.gravacoes[index].tecnica,
        local: gravacao.local,
        descricao: gravacao.descricao,
        detalhe: gravacao.detalhe,
        custoUnitario: gravacao.custoUnitario,
        custoTotal: gravacao.custoTotal,
      }));
      const costing: ItemCosting = {
        custoProduto: productCost,
        personalizacao: gravacoes.length ? gravacoes.map((g) => (g.local ? `${g.descricao} (${g.local})` : g.descricao)).join(" + ") : null,
        detalhe: gravacoes.map((g) => g.detalhe).filter(Boolean).join(" · "),
        personalizacaoUnitaria: calc.gravacoesPorPeca,
        custoPersonalizacaoTotal: cents(gravacoes.reduce((sum, g) => sum + g.custoTotal, 0)),
        freteFornecedor: FRETE_FORNECEDOR_PRODUTO,
        tecnica: gravacoes[0]?.tecnica ?? { tipo: "nenhuma" },
        gravacoes,
        por: actor.name,
        em: now,
      };

      items.push({
        id: draft.id,
        productName: product ? product.name : (draft as Extract<DraftItem, { source: "avulso" }>).name,
        slug: product ? `${GIFT_PREFIX}${product.publicId}` : `avulso:${randomUUID().slice(0, 8)}`,
        quantity: draft.quantity,
        selections: variant ? { "Variação": variant.label } : {},
        artworkName: null,
        unitPrice: calc.precoUnitario,
        codes: product && variant ? { fare: product.fareCode, supplier: product.supplier, supplierCode: product.supplierCode, sku: variant.sku } : null,
        gravacoes: gravacoes.map(({ descricao, local }) => ({ descricao, local })),
        costing,
      });
      preview.push({
        id: draft.id,
        ok: true,
        unitPrice: calc.precoUnitario,
        total: calc.total,
        cost: calc.custoTotal,
        productCost,
        gravacoes: gravacoes.map(({ descricao, local, detalhe, custoUnitario, custoTotal }) => ({ descricao, local, detalhe, custoUnitario, custoTotal })),
        ...(variant && variant.stock < draft.quantity ? { stockWarning: `Estoque da cor: ${variant.stock.toLocaleString("pt-BR")} un.` } : {}),
      });
    } catch (error) {
      preview.push({ id: draft.id, ok: false, error: error instanceof Error ? error.message : "Item inválido." });
    }
  }

  const valid = preview.filter((entry): entry is Extract<ItemPreview, { ok: true }> => entry.ok);
  const total = cents(valid.reduce((sum, entry) => sum + entry.total, 0));
  const cost = cents(valid.reduce((sum, entry) => sum + entry.cost, 0));
  return { items, preview, totals: { total, cost, margin: cents(total - cost), pending: preview.length - valid.length } };
}

/** Item gravado → rascunho para abrir de novo no editor. */
export function draftFromItem(item: QuoteCartItem): DraftItem {
  const costing = item.costing ?? null;
  let gravacoes: DraftGravacao[] = [];
  if (costing?.gravacoes) gravacoes = costing.gravacoes.map(({ tecnica, local }) => ({ tecnica, local }));
  else if (costing?.tecnica && costing.tecnica.tipo !== "nenhuma") gravacoes = [{ tecnica: costing.tecnica, local: "" }];

  if (item.slug.startsWith(GIFT_PREFIX)) {
    return {
      id: item.id,
      source: "catalogo",
      publicId: item.slug.slice(GIFT_PREFIX.length),
      variant: item.selections?.["Variação"] ?? "",
      quantity: item.quantity,
      gravacoes,
    };
  }
  return { id: item.id, source: "avulso", name: item.productName, cost: costing?.custoProduto ?? 0, quantity: item.quantity, gravacoes };
}
