import { randomUUID } from "node:crypto";
import { calcularItemOrcamento, FRETE_FORNECEDOR_PRODUTO, type Tecnica } from "@/lib/backoffice/customization";
import { photoFromName } from "@/components/staff/photoItems";
import { isMockupFile } from "@/lib/backoffice/mockupFiles";
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
  /** Descrição do fornecedor (janela de detalhes da busca da equipe). */
  description?: string;
  fareCode: string;
  supplier: SupplierId;
  supplierCode: string;
  variants: Array<{ label: string; cost: number; stock: number; sku: string; imageUrl: string }>;
  spotOptions: SpotCustomization[];
};

/** custoOverride: custo da gravação por peça digitado pela equipe (vazio = calculado). */
export type DraftGravacao = { tecnica: Record<string, unknown> & { tipo: string }; local: string; custoOverride?: number };
/** Valores digitados à mão (vazio = automático): custo do produto por peça e preço de venda por peça. */
type ManualValues = { costOverride?: number; priceOverride?: number };
export type DraftItem =
  | ({ id: string; source: "catalogo"; publicId: string; variant: string; quantity: number; gravacoes: DraftGravacao[] } & ManualValues)
  | ({ id: string; source: "avulso"; name: string; cost: number; quantity: number; gravacoes: DraftGravacao[]; mockup?: string } & ManualValues);

export type ItemPreview =
  | {
    id: string;
    ok: true;
    unitPrice: number;
    total: number;
    /** Custo total do item (produto + gravações + frete do fornecedor). */
    cost: number;
    productCost: number;
    gravacoes: Array<{ descricao: string; local: string; detalhe: string; custoUnitario: number; custoTotal: number; manual?: true }>;
    stockWarning?: string;
    /** O que foi digitado à mão neste item. */
    manual: { cost: boolean; price: boolean };
    /** Preço calculado pela regra (para comparar quando o preço foi digitado). */
    suggestedPrice: number;
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

/** Valor opcional digitado à mão: vazio = undefined; texto que não é número = erro. */
function optionalNumber(value: unknown, error: string): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) throw new Error(error);
  return parsed;
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
      const custoOverride = optionalNumber(g.custoOverride, `Item ${index + 1}: custo da gravação inválido.`);
      return { tecnica: parseTecnica(g.tecnica), local: String(g.local ?? "").trim().slice(0, 80), ...(custoOverride === undefined ? {} : { custoOverride }) };
    });
    const costOverride = optionalNumber(item.costOverride, `Item ${index + 1}: custo inválido.`);
    const priceOverride = optionalNumber(item.priceOverride, `Item ${index + 1}: preço de venda inválido.`);
    const manual = { ...(costOverride === undefined ? {} : { costOverride }), ...(priceOverride === undefined ? {} : { priceOverride }) };
    if (item.source === "avulso") {
      const name = String(item.name ?? "").trim().slice(0, 120);
      // Imagem enviada do computador (arquivo em data/mockups); só aceita nome gerado pelo envio.
      const mockup = typeof item.mockup === "string" && isMockupFile(item.mockup) ? { mockup: item.mockup } : {};
      return { id, source: "avulso" as const, name, cost: toNumber(item.cost), quantity, gravacoes, ...mockup, ...manual };
    }
    return {
      id,
      source: "catalogo" as const,
      publicId: String(item.publicId ?? "").slice(0, 80),
      variant: String(item.variant ?? "").slice(0, 80),
      quantity,
      gravacoes,
      ...manual,
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
      if (draft.costOverride !== undefined && !(draft.costOverride >= 0)) throw new Error("Custo do produto inválido.");
      if (draft.priceOverride !== undefined && !(cents(draft.priceOverride) > 0)) throw new Error("Preço de venda inválido.");
      const productCost = draft.costOverride ?? (variant ? variant.cost : (draft as Extract<DraftItem, { source: "avulso" }>).cost);
      // Foto (revelação/ampliação) é feita na loja: sem frete de fornecedor.
      const freteFornecedor = draft.source === "avulso" && photoFromName(draft.name) ? 0 : FRETE_FORNECEDOR_PRODUTO;

      const calc = calcularItemOrcamento({
        custoProduto: productCost,
        categoria: product?.category ?? "",
        quantidade: draft.quantity,
        freteFornecedor,
        gravacoes: draft.gravacoes.map(({ tecnica, local, custoOverride }) => ({ tecnica: resolveTecnica(tecnica, product), local, custoOverride })),
      });
      const gravacoes = calc.gravacoes.map((gravacao, index) => ({
        tecnica: draft.gravacoes[index].tecnica,
        local: gravacao.local,
        descricao: gravacao.descricao,
        detalhe: gravacao.detalhe,
        custoUnitario: gravacao.custoUnitario,
        custoTotal: gravacao.custoTotal,
        ...(gravacao.manual ? { manual: true as const } : {}),
      }));
      // Preço digitado vale no lugar do calculado (margem segue sobre o custo real).
      const unitPrice = draft.priceOverride === undefined ? calc.precoUnitario : cents(draft.priceOverride);
      const itemTotal = cents(unitPrice * draft.quantity);
      const manual = {
        ...(draft.costOverride !== undefined ? { custoProduto: true as const } : {}),
        ...(draft.priceOverride !== undefined ? { precoVenda: true as const } : {}),
      };
      const costing: ItemCosting = {
        custoProduto: productCost,
        personalizacao: gravacoes.length ? gravacoes.map((g) => (g.local ? `${g.descricao} (${g.local})` : g.descricao)).join(" + ") : null,
        detalhe: gravacoes.map((g) => g.detalhe).filter(Boolean).join(" · "),
        personalizacaoUnitaria: calc.gravacoesPorPeca,
        custoPersonalizacaoTotal: cents(gravacoes.reduce((sum, g) => sum + g.custoTotal, 0)),
        freteFornecedor,
        tecnica: gravacoes[0]?.tecnica ?? { tipo: "nenhuma" },
        gravacoes,
        ...(Object.keys(manual).length ? { manual } : {}),
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
        unitPrice,
        codes: product && variant ? { fare: product.fareCode, supplier: product.supplier, supplierCode: product.supplierCode, sku: variant.sku } : null,
        gravacoes: gravacoes.map(({ descricao, local }) => ({ descricao, local })),
        costing,
        ...(draft.source === "avulso" && draft.mockup ? { mockup: draft.mockup } : {}),
      });
      preview.push({
        id: draft.id,
        ok: true,
        unitPrice,
        total: itemTotal,
        cost: calc.custoTotal,
        productCost,
        gravacoes: gravacoes.map(({ descricao, local, detalhe, custoUnitario, custoTotal, manual: hand }) => ({ descricao, local, detalhe, custoUnitario, custoTotal, ...(hand ? { manual: hand } : {}) })),
        manual: { cost: draft.costOverride !== undefined, price: draft.priceOverride !== undefined },
        suggestedPrice: calc.precoUnitario,
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
/**
 * Reabrir no editor: se a regra de hoje dá outro preço (catálogo ou custo mudou), o preço salvo
 * volta como digitado. Assim salvar não muda sozinho o total já combinado com o cliente.
 */
export function keepSavedPrices(drafts: DraftItem[], saved: QuoteCartItem[], lookup: (publicId: string) => BuilderProduct | null): DraftItem[] {
  return drafts.map((draft, index) => {
    const price = saved[index]?.unitPrice;
    if (draft.priceOverride !== undefined || price == null) return draft;
    const [rebuilt] = buildQuoteItems([draft], lookup, { name: "" }).items;
    return rebuilt && rebuilt.unitPrice !== price ? { ...draft, priceOverride: price } : draft;
  });
}

export function draftFromItem(item: QuoteCartItem): DraftItem {
  const costing = item.costing ?? null;
  let gravacoes: DraftGravacao[] = [];
  if (costing?.gravacoes) {
    gravacoes = costing.gravacoes.map(({ tecnica, local, custoUnitario, manual }) => (manual ? { tecnica, local, custoOverride: custoUnitario } : { tecnica, local }));
  } else if (costing?.tecnica && costing.tecnica.tipo !== "nenhuma") gravacoes = [{ tecnica: costing.tecnica, local: "" }];
  const manualValues = {
    ...(costing?.manual?.custoProduto ? { costOverride: costing.custoProduto } : {}),
    ...(costing?.manual?.precoVenda && item.unitPrice !== null ? { priceOverride: item.unitPrice } : {}),
  };

  if (item.slug.startsWith(GIFT_PREFIX)) {
    return {
      id: item.id,
      source: "catalogo",
      publicId: item.slug.slice(GIFT_PREFIX.length),
      variant: item.selections?.["Variação"] ?? "",
      quantity: item.quantity,
      gravacoes,
      ...manualValues,
    };
  }
  // Avulso: o custo já é sempre digitado (fica em "cost"); só o preço pode ser à mão.
  const { priceOverride } = manualValues as { priceOverride?: number };
  return { id: item.id, source: "avulso", name: item.productName, cost: costing?.custoProduto ?? 0, quantity: item.quantity, gravacoes, ...(item.mockup ? { mockup: item.mockup } : {}), ...(priceOverride === undefined ? {} : { priceOverride }) };
}
