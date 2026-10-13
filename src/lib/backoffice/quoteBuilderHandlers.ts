import type { DatabaseSync } from "node:sqlite";
import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { buildQuoteItems, draftFromItem, parseDraftItems, type BuilderProduct } from "@/lib/backoffice/quoteBuilder";
import type { QuoteBilling, QuoteCustomer } from "@/lib/commerce";
import { createPanelCustomer, DuplicateCustomerError, resolveCustomer, searchCustomers } from "@/lib/customers/repository";
import { SUPPLIER_LABELS } from "@/lib/productCodes";
import { applyDiscount, parseDiscount, type QuoteDiscount } from "@/lib/quotes/discount";
import { createManualQuote, findQuoteById, replaceQuoteItems, type Quote } from "@/lib/quotes/repository";

/** Rotas do editor de orçamentos do painel (clientes, produtos, prévia, criar e editar). */

export type StaffUser = { user: { id: string; name: string; role?: unknown } };

export type QuoteBuilderDeps = {
  getSession: SessionReader<StaffUser>;
  database: () => DatabaseSync;
  /** Catálogo do servidor: produto pelo id público e busca para o painel. */
  catalog: () => Promise<{ lookup: (publicId: string) => BuilderProduct | null; search: (query: string, limit: number) => BuilderProduct[] }>;
  readBilling?: (userId: string) => QuoteBilling | null;
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function staff(deps: QuoteBuilderDeps, request: Request) {
  const session = await deps.getSession({ headers: request.headers });
  if (!session) return { error: json({ error: "AUTH_REQUIRED" }, 401) };
  if (!hasBackofficeAccess(resolveUserRole(session.user))) return { error: json({ error: "FORBIDDEN" }, 403) };
  return { session };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function customerSnapshot(deps: QuoteBuilderDeps, ref: string): { ownerId: string; customer: QuoteCustomer } | null {
  const resolved = resolveCustomer(deps.database(), ref);
  if (!resolved) return null;
  const billing = resolved.kind === "conta" ? deps.readBilling?.(resolved.ownerId) ?? null : null;
  return {
    ownerId: resolved.ownerId,
    customer: {
      name: resolved.name,
      ...(resolved.company ? { company: resolved.company } : {}),
      ...(resolved.phone ? { phone: resolved.phone } : {}),
      ...(billing ? { billing } : {}),
    },
  };
}

export type EditorProduct = ReturnType<typeof toEditorProduct>;

/** Produto como o editor precisa (custo e estoque só para a equipe; nunca vai ao site). */
export function toEditorProduct(product: BuilderProduct) {
  return {
    publicId: product.publicId,
    name: product.name,
    category: product.category,
    imageUrl: product.imageUrl,
    fareCode: product.fareCode,
    /** Código do fornecedor com o nome (só a equipe vê). */
    supplierCode: `${SUPPLIER_LABELS[product.supplier]} ${product.supplierCode}`,
    supplier: product.supplier,
    variants: product.variants.map(({ label, cost, stock, imageUrl }) => ({ label, cost, stock, imageUrl })),
    spotOptions: product.spotOptions.map(({ id, tecnica, local, componente, area, cores, padrao }) => ({ id, tecnica, local, componente, area, cores, padrao })),
  };
}

const reais = (centsValue: number) => centsValue / 100;

/** Totais da prévia com o desconto: subtotal, desconto, total e margem (sobre o total descontado). */
function totalsWithDiscount(totals: { total: number; cost: number; pending: number }, discount: QuoteDiscount | null) {
  const subtotalCents = Math.round(totals.total * 100);
  let applied = { subtotalCents, discountCents: 0, totalCents: subtotalCents };
  let discountError: string | undefined;
  try {
    applied = applyDiscount(subtotalCents, discount);
  } catch (error) {
    discountError = error instanceof Error ? error.message : "Desconto inválido.";
  }
  return {
    totals: {
      subtotal: reais(applied.subtotalCents),
      discount: reais(applied.discountCents),
      total: reais(applied.totalCents),
      cost: totals.cost,
      margin: reais(applied.totalCents - Math.round(totals.cost * 100)),
      pending: totals.pending,
    },
    discountError,
  };
}

export function createQuoteBuilderHandlers(deps: QuoteBuilderDeps) {
  return {
    async searchCustomers(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const query = new URL(request.url).searchParams.get("q") ?? "";
      return json({ customers: searchCustomers(deps.database(), query.slice(0, 80)) });
    },

    async createCustomer(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const body = await readJson(request);
      if (!body) return json({ error: "INVALID_REQUEST" }, 400);
      try {
        const customer = createPanelCustomer(deps.database(), {
          name: String(body.name ?? ""), company: String(body.company ?? ""), phone: String(body.phone ?? ""),
          email: String(body.email ?? ""), document: String(body.document ?? ""),
        }, { id: access.session.user.id, name: access.session.user.name });
        return json({ customer }, 201);
      } catch (error) {
        if (error instanceof DuplicateCustomerError) return json({ error: "DUPLICATE", message: error.message, matches: error.matches }, 409);
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Dados inválidos." }, 400);
      }
    },

    async searchProducts(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
      if (!query) return json({ products: [] });
      const catalog = await deps.catalog();
      return json({ products: catalog.search(query, 12).map(toEditorProduct) });
    },

    async preview(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const body = await readJson(request);
      try {
        const drafts = parseDraftItems(body?.items);
        let discount: QuoteDiscount | null = null;
        let parseError: string | undefined;
        try {
          discount = parseDiscount(body?.discount);
        } catch (error) {
          parseError = error instanceof Error ? error.message : "Desconto inválido.";
        }
        const catalog = await deps.catalog();
        const { preview, totals } = buildQuoteItems(drafts, catalog.lookup, { name: access.session.user.name });
        const withDiscount = totalsWithDiscount(totals, discount);
        const discountError = parseError ?? withDiscount.discountError;
        return json({ preview, totals: withDiscount.totals, ...(discountError ? { discountError } : {}) });
      } catch (error) {
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Rascunho inválido." }, 400);
      }
    },

    async create(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const body = await readJson(request);
      if (!body) return json({ error: "INVALID_REQUEST" }, 400);
      const idempotencyKey = String(body.idempotencyKey ?? "").slice(0, 80);
      if (idempotencyKey.length < 8) return json({ error: "INVALID_REQUEST", message: "Chave do envio inválida." }, 400);
      const owner = customerSnapshot(deps, String(body.customerRef ?? ""));
      if (!owner) return json({ error: "INVALID_REQUEST", message: "Escolha o cliente." }, 400);
      try {
        const drafts = parseDraftItems(body.items);
        const discount = parseDiscount(body.discount);
        const catalog = await deps.catalog();
        const { items, preview } = buildQuoteItems(drafts, catalog.lookup, { name: access.session.user.name });
        if (items.length !== drafts.length) return json({ error: "INVALID_ITEMS", preview }, 422);
        const quote = createManualQuote(deps.database(), {
          ownerId: owner.ownerId, customer: owner.customer, items, createdBy: access.session.user.name,
          internalNotes: String(body.internalNotes ?? "").trim().slice(0, 2000), idempotencyKey, discount,
        });
        return json({ id: quote.id }, 201);
      } catch (error) {
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Não foi possível criar." }, 400);
      }
    },

    async read(request: Request, quoteId: string) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const quote = findQuoteById(deps.database(), quoteId);
      if (!quote) return json({ error: "QUOTE_NOT_FOUND" }, 404);
      const state = editorState(quote);
      const catalog = await deps.catalog();
      const products: Record<string, ReturnType<typeof toEditorProduct>> = {};
      for (const item of state.items) {
        if (item.source !== "catalogo" || products[item.publicId]) continue;
        const product = catalog.lookup(item.publicId);
        if (product) products[item.publicId] = toEditorProduct(product);
      }
      return json({ ...state, products });
    },

    async update(request: Request, quoteId: string) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const body = await readJson(request);
      if (!body) return json({ error: "INVALID_REQUEST" }, 400);
      const quote = findQuoteById(deps.database(), quoteId);
      if (!quote) return json({ error: "QUOTE_NOT_FOUND" }, 404);
      try {
        const drafts = parseDraftItems(body.items);
        // Campo ausente = mantém o desconto atual; null/vazio = sem desconto.
        const discount = "discount" in body ? parseDiscount(body.discount) : undefined;
        const catalog = await deps.catalog();
        const { items, preview } = buildQuoteItems(drafts, catalog.lookup, { name: access.session.user.name });
        if (items.length !== drafts.length) return json({ error: "INVALID_ITEMS", preview }, 422);
        // Itens que não mudaram mantêm quem formou o preço e quando.
        const previous = new Map(quote.items.map((item) => [item.id, item]));
        const merged = items.map((item) => {
          const before = previous.get(item.id);
          const same = before?.costing && before.unitPrice === item.unitPrice && before.quantity === item.quantity
            && JSON.stringify(draftFromItem(before)) === JSON.stringify(draftFromItem(item));
          return same && before.costing && item.costing ? { ...item, costing: { ...item.costing, por: before.costing.por, em: before.costing.em } } : item;
        });
        const updated = replaceQuoteItems(deps.database(), {
          quoteId, items: merged, internalNotes: String(body.internalNotes ?? "").trim().slice(0, 2000), expectedUpdatedAt: String(body.updatedAt ?? ""), discount,
        });
        return json({ id: updated.id, updatedAt: updated.updatedAt });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível salvar.";
        return json({ error: /outra pessoa/.test(message) ? "CONFLICT" : "INVALID_REQUEST", message }, /outra pessoa/.test(message) ? 409 : 400);
      }
    },
  };
}

/** Orçamento aberto no editor: cliente, rascunho dos itens e observação interna. */
export function editorState(quote: Quote) {
  return {
    id: quote.id,
    status: quote.status,
    updatedAt: quote.updatedAt,
    createdBy: quote.createdBy,
    internalNotes: quote.internalNotes,
    discount: quote.discount,
    customer: { name: quote.customer.name, company: quote.customer.company ?? "", phone: quote.customer.phone ?? "", notes: quote.customer.notes ?? "" },
    items: quote.items.map(draftFromItem),
  };
}
