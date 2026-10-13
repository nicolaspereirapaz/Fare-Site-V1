import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole, type BackofficeSession } from "@/lib/backoffice/access";
import {
  calcularPersonalizacao,
  DTF_TEXTIL,
  DTF_UV,
  FRETE_FORNECEDOR_PRODUTO,
  LASER,
  TECNICA_LABELS,
  type Tecnica,
} from "@/lib/backoffice/customization";
import type { ItemCosting } from "@/lib/commerce";
import type { Quote } from "@/lib/quotes/repository";
import type { SpotCustomization } from "@/lib/suppliers/spotCustomizations";
import type { SupplierId } from "@/lib/xbz";

/**
 * Painel da equipe → orçamento → "Formar preço" de um item.
 * O custo do produto vem sempre do catálogo (no servidor); o vendedor só escolhe quantidade e
 * personalização. Produto fora do catálogo: o vendedor informa o custo.
 */
export type PricingProduct = {
  name: string;
  category: string;
  supplier: SupplierId;
  cost: number | null;
  fareCode: string;
  supplierCode: string;
  spotReference: string | null;
};

type StaffSession = BackofficeSession & { user: { name?: string } };

export type QuotePricingDeps = {
  getSession: SessionReader<StaffSession>;
  findQuote: (quoteId: string) => Quote | null;
  lookupProduct: (quote: Quote, itemIndex: number) => Promise<PricingProduct | null>;
  spotOptions: (reference: string) => SpotCustomization[];
  saveItem: (input: { quoteId: string; itemIndex: number; quantity: number; unitPrice: number; costing: ItemCosting }) => Quote;
};

const EDITABLE = new Set(["aguardando_orcamento", "em_negociacao", "aguardando_pagamento"]);

function techniquesFor(product: PricingProduct | null, spot: SpotCustomization[]) {
  const list: Array<{ tipo: Tecnica["tipo"]; label: string; info: string }> = [
    { tipo: "nenhuma", label: TECNICA_LABELS.nenhuma, info: "Só o produto." },
    { tipo: "laser", label: TECNICA_LABELS.laser, info: `${LASER.fornecedor}: R$ 1,00 por peça em canetas e chaveiros; R$ 2,50 nas demais.` },
    { tipo: "dtf-textil", label: TECNICA_LABELS["dtf-textil"], info: `${DTF_TEXTIL.fornecedor}: rolo de 58 cm, R$ 29,90 o metro (fracionado, mín. 1 m) + frete R$ 16,00.` },
    { tipo: "dtf-uv", label: TECNICA_LABELS["dtf-uv"], info: `${DTF_UV.fornecedor}: folhas 20×28 ou 28×40 cm (escolhe a mais barata) + frete R$ 10,00.` },
  ];
  if (product?.supplier === "spot" && spot.length) list.push({ tipo: "spot", label: TECNICA_LABELS.spot, info: "Preço da própria Spot, pela faixa de quantidade." });
  list.push({ tipo: "manual", label: TECNICA_LABELS.manual, info: "Digite o nome e o custo por peça." });
  return list;
}

function number(value: unknown) {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Monta a técnica a partir do que veio do navegador (só formato; o cálculo é todo no servidor). */
function parseTechnique(raw: unknown, spot: SpotCustomization[]): Tecnica {
  const body = (raw ?? {}) as Record<string, unknown>;
  switch (body.tipo) {
    case "laser":
      return { tipo: "laser" };
    case "dtf-textil":
    case "dtf-uv":
      return { tipo: body.tipo, larguraCm: number(body.larguraCm), alturaCm: number(body.alturaCm) };
    case "spot": {
      const opcao = spot.find((option) => option.id === body.opcaoId);
      if (!opcao) throw new Error("Escolha uma personalização da Spot.");
      return { tipo: "spot", opcao };
    }
    case "manual":
      return { tipo: "manual", nome: String(body.nome ?? "").slice(0, 80), custoUnitario: number(body.custoUnitario) };
    default:
      return { tipo: "nenhuma" };
  }
}

export function createQuotePricingHandlers(deps: QuotePricingDeps) {
  type Ctx = { error: Response } | {
    error?: undefined; session: StaffSession; quote: Quote; item: Quote["items"][number]; product: PricingProduct | null; spot: SpotCustomization[];
  };

  async function context(request: Request, quoteId: string, itemIndex: number): Promise<Ctx> {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return { error: Response.json({ error: "AUTH_REQUIRED" }, { status: 401 }) };
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return { error: Response.json({ error: "FORBIDDEN" }, { status: 403 }) };
    const quote = deps.findQuote(quoteId);
    const item = quote?.items[itemIndex];
    if (!quote || !item) return { error: Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 }) };
    const product = await deps.lookupProduct(quote, itemIndex);
    const spot = product?.supplier === "spot" && product.spotReference ? deps.spotOptions(product.spotReference) : [];
    return { session, quote, item, product, spot };
  }

  return {
    async read(request: Request, quoteId: string, itemIndex: number): Promise<Response> {
      const ctx = await context(request, quoteId, itemIndex);
      if (ctx.error) return ctx.error;
      return Response.json({
        item: { productName: ctx.item.productName, quantity: ctx.item.quantity, selections: ctx.item.selections, unitPrice: ctx.item.unitPrice, costing: ctx.item.costing ?? null },
        product: ctx.product,
        spotOptions: ctx.spot,
        techniques: techniquesFor(ctx.product, ctx.spot),
        freteFornecedor: FRETE_FORNECEDOR_PRODUTO,
        editable: EDITABLE.has(ctx.quote.status),
      });
    },

    async price(request: Request, quoteId: string, itemIndex: number): Promise<Response> {
      const ctx = await context(request, quoteId, itemIndex);
      if (ctx.error) return ctx.error;
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
      }

      try {
        const quantidade = number(body.quantidade);
        if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > 1_000_000) throw new Error("Informe a quantidade.");
        // Custo do catálogo; só quando o produto não está no catálogo o vendedor informa.
        const catalogCost = ctx.product?.cost ?? null;
        const custoProduto = catalogCost ?? number(body.custoProduto);
        if (!(custoProduto >= 0)) throw new Error("Produto fora do catálogo: informe o custo do produto.");
        const tecnica = parseTechnique(body.tecnica, ctx.spot);
        const result = calcularPersonalizacao({ custoProduto, categoria: ctx.product?.category ?? "", quantidade, tecnica });

        if (body.aplicar !== true) return Response.json({ result, custoProduto });
        if (!EDITABLE.has(ctx.quote.status)) return Response.json({ error: "QUOTE_LOCKED", message: "Este orçamento não pode mais ser alterado." }, { status: 409 });

        const costing: ItemCosting = {
          custoProduto,
          personalizacao: tecnica.tipo === "nenhuma" ? null : result.descricao,
          detalhe: result.detalhe,
          personalizacaoUnitaria: result.personalizacaoUnitaria,
          custoPersonalizacaoTotal: result.custoPersonalizacaoTotal,
          freteFornecedor: FRETE_FORNECEDOR_PRODUTO,
          tecnica: tecnica.tipo === "spot" ? { tipo: "spot", opcaoId: tecnica.opcao.id } : tecnica,
          por: ctx.session.user.name ?? "",
          em: new Date().toISOString(),
        };
        const quote = deps.saveItem({ quoteId, itemIndex, quantity: quantidade, unitPrice: result.precoUnitarioFinal, costing });
        return Response.json({ result, custoProduto, total: quote.totalCents === null ? null : quote.totalCents / 100 });
      } catch (error) {
        return Response.json({ error: "INVALID_PRICING", message: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 });
      }
    },
  };
}
