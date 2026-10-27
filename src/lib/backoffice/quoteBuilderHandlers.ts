import type { DatabaseSync } from "node:sqlite";
import { isProfessional } from "@/lib/professional";
import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { buildQuoteItems, draftFromItem, keepSavedPrices, parseDraftItems, type BuilderProduct } from "@/lib/backoffice/quoteBuilder";
import { parseStaffFilters, type StaffBrowseResult, type StaffFilters, type StaffMatch } from "@/lib/backoffice/productSearch";
import type { QuoteBilling, QuoteCustomer } from "@/lib/commerce";
import { createPanelCustomer, DuplicateCustomerError, resolveCustomer, searchCustomers, updateCustomer } from "@/lib/customers/repository";
import { formatDeliveryAddress } from "@/lib/customers/address";
import { SUPPLIER_LABELS } from "@/lib/productCodes";
import { applyDiscount, parseDiscount, type QuoteDiscount } from "@/lib/quotes/discount";
import { NO_CUSTOMER_NAME, NO_CUSTOMER_OWNER } from "@/lib/quotes/quoteCode";
import { createManualQuote, findQuoteById, replaceQuoteItems, type Quote, type QuoteDelivery } from "@/lib/quotes/repository";
import { findOrderById } from "@/lib/orders/repository";
import { getOrderFinance, replaceOrderItems, requireDate } from "@/lib/orders/payments";
import { financialMutationGuard } from "@/lib/backoffice/financialMutationGuard";

/** Rotas do editor de orçamentos do painel (clientes, produtos, prévia, criar e editar). */

export type StaffUser = { user: { id: string; name: string; role?: unknown } };

export type QuoteBuilderDeps = {
  getSession: SessionReader<StaffUser>;
  database: () => DatabaseSync;
  /** Catálogo do servidor: produto pelo id público e busca filtrada/paginada para o painel. */
  catalog: () => Promise<{ lookup: (publicId: string) => BuilderProduct | null; browse: (filters: StaffFilters) => StaffBrowsePage }>;
  readBilling?: (userId: string) => QuoteBilling | null;
};

export type StaffBrowsePage = Omit<StaffBrowseResult<unknown>, "items"> & { items: Array<{ product: BuilderProduct; match: StaffMatch }> };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function staff(deps: QuoteBuilderDeps, request: Request) {
  const session = await deps.getSession({ headers: request.headers });
  if (!session) return { error: json({ error: "AUTH_REQUIRED" }, 401) };
  if (!hasBackofficeAccess(resolveUserRole(session.user))) return { error: json({ error: "FORBIDDEN" }, 403) };
  return { session };
}

/** Entrega prevista do orçamento: data opcional e horário só junto com a data. Sem o campo = não mexe. */
function parseQuoteDelivery(body: Record<string, unknown>): QuoteDelivery | undefined {
  if (!("deliveryDate" in body)) return undefined;
  const date = body.deliveryDate || null;
  const time = body.deliveryTime || null;
  if (date !== null) requireDate(date);
  if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("Horário inválido; use HH:MM.");
  if (time !== null && date === null) throw new Error("Informe a data junto com o horário.");
  return { date: date as string | null, time: time as string | null };
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function customerSnapshot(deps: QuoteBuilderDeps, ref: string): { ownerId: string; customer: QuoteCustomer } | null {
  const resolved = resolveCustomer(deps.database(), ref);
  if (!resolved) return null;
  const billing = resolved.kind === "conta" ? deps.readBilling?.(resolved.ownerId) ?? null : null;
  return {
    ownerId: resolved.ownerId,
    customer: {
      name: resolved.name,
      ...(resolved.company ? { company: resolved.company } : {}),
      ...(resolved.phone ? { phone: resolved.phone } : {}),
      ...(resolved.address ? { address: formatDeliveryAddress(resolved.address) } : {}),
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
    description: product.description ?? "",
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
  let applied = { subtotalCents, discountCents: 0, freightCents: 0, totalCents: subtotalCents };
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
      freight: reais(applied.freightCents),
      total: reais(applied.totalCents),
      cost: totals.cost,
      // Frete é repassado: não entra na margem.
      margin: reais(applied.totalCents - applied.freightCents - Math.round(totals.cost * 100)),
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
      const params = new URL(request.url).searchParams;
      // ?ref= : um cadastro só (para o "Editar" do cliente)
      const ref = params.get("ref");
      if (ref) { const found = resolveCustomer(deps.database(), ref.slice(0, 120)); return json({ customers: found ? [found] : [] }); }
      const query = params.get("q") ?? "";
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
          email: String(body.email ?? ""), document: String(body.document ?? ""), address: body.address,
        }, { id: access.session.user.id, name: access.session.user.name });
        return json({ customer }, 201);
      } catch (error) {
        if (error instanceof DuplicateCustomerError) return json({ error: "DUPLICATE", message: error.message, matches: error.matches }, 409);
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Dados inválidos." }, 400);
      }
    },

    /** Editar cliente cadastrado (conta do site ou do painel). */
    async updateCustomer(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const body = await readJson(request);
      if (!body || typeof body.ref !== "string") return json({ error: "INVALID_REQUEST" }, 400);
      try {
        const customer = updateCustomer(deps.database(), body.ref, {
          name: String(body.name ?? ""), company: String(body.company ?? ""), phone: String(body.phone ?? ""),
          email: String(body.email ?? ""), document: String(body.document ?? ""), address: body.address,
        });
        return json({ customer });
      } catch (error) {
        if (error instanceof DuplicateCustomerError) return json({ error: "DUPLICATE", message: "WhatsApp, e-mail ou CPF/CNPJ já está em outro cadastro.", matches: error.matches }, 409);
        return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Dados inválidos." }, 400);
      }
    },

    /** Janela "Escolha o produto": busca + filtros (fornecedor, grupo de cor, categoria, custo, estoque mínimo) e páginas. */
    async searchProducts(request: Request) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const filters = parseStaffFilters(new URL(request.url).searchParams);
      const catalog = await deps.catalog();
      const result = catalog.browse(filters);
      return json({
        products: result.items.map(({ product, match }) => ({ ...toEditorProduct(product), match })),
        total: result.total,
        page: result.page,
        pages: result.pages,
        colorCounts: result.colorCounts,
      });
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
      // Cliente é opcional: sem ele, o orçamento fica "Cliente a definir" e pode ser escolhido depois.
      const ref = String(body.customerRef ?? "").trim();
      const owner = ref ? customerSnapshot(deps, ref) : { ownerId: NO_CUSTOMER_OWNER, customer: { name: NO_CUSTOMER_NAME } };
      if (!owner) return json({ error: "INVALID_REQUEST", message: "Cliente não encontrado. Escolha de novo." }, 400);
      try {
        const drafts = parseDraftItems(body.items);
        const discount = parseDiscount(body.discount);
        const catalog = await deps.catalog();
        const { items, preview } = buildQuoteItems(drafts, catalog.lookup, { name: access.session.user.name });
        if (items.length !== drafts.length) return json({ error: "INVALID_ITEMS", preview }, 422);
        const quote = createManualQuote(deps.database(), {
          ownerId: owner.ownerId, customer: owner.customer, items, createdBy: access.session.user.name,
          internalNotes: String(body.internalNotes ?? "").trim().slice(0, 2000), idempotencyKey, discount, delivery: parseQuoteDelivery(body),
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
      const catalog = await deps.catalog();
      const base = editorState(quote);
      const state = { ...base, items: keepSavedPrices(base.items, quote.items, catalog.lookup), customerProfessional: isProfessional(deps.database(), quote.userId) };
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
        const ref = String(body.customerRef ?? "").trim();
        const owner = ref && quote.userId === NO_CUSTOMER_OWNER ? customerSnapshot(deps, ref) : null;
        if (ref && quote.userId === NO_CUSTOMER_OWNER && !owner) return json({ error: "INVALID_REQUEST", message: "Cliente não encontrado. Escolha de novo." }, 400);
        const catalog = await deps.catalog();
        const { items, preview } = buildQuoteItems(drafts, catalog.lookup, { name: access.session.user.name });
        if (items.length !== drafts.length) return json({ error: "INVALID_ITEMS", preview }, 422);
        // Itens que não mudaram mantêm quem formou o preço e quando; o mockup fica com o item.
        const previous = new Map(quote.items.map((item) => [item.id, item]));
        const merged = items.map((item) => {
          const before = previous.get(item.id);
          const same = before?.costing && before.unitPrice === item.unitPrice && before.quantity === item.quantity
            && JSON.stringify(draftFromItem(before)) === JSON.stringify(draftFromItem(item));
          const kept = !item.mockup && before?.mockup ? { ...item, mockup: before.mockup } : item;
          return same && before.costing && item.costing ? { ...kept, costing: { ...item.costing, por: before.costing.por, em: before.costing.em } } : kept;
        });
        const updated = replaceQuoteItems(deps.database(), {
          quoteId, items: merged, internalNotes: String(body.internalNotes ?? "").trim().slice(0, 2000), expectedUpdatedAt: String(body.updatedAt ?? ""), discount, owner, delivery: parseQuoteDelivery(body),
        });
        return json({ id: updated.id, updatedAt: updated.updatedAt });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível salvar.";
        return json({ error: /outra pessoa/.test(message) ? "CONFLICT" : "INVALID_REQUEST", message }, /outra pessoa/.test(message) ? 409 : 400);
      }
    },

    /** Pedido aberto no editor (mesmo formato do orçamento + quanto já foi recebido). */
    async readOrder(request: Request, orderId: string) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const order = findOrderById(deps.database(), orderId);
      if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
      const finance = getOrderFinance(deps.database(), orderId);
      const catalog = await deps.catalog();
      const items = keepSavedPrices(order.items.map(draftFromItem), order.items, catalog.lookup);
      const products: Record<string, ReturnType<typeof toEditorProduct>> = {};
      for (const item of items) {
        if (item.source !== "catalogo" || products[item.publicId]) continue;
        const product = catalog.lookup(item.publicId);
        if (product) products[item.publicId] = toEditorProduct(product);
      }
      return json({
        id: order.id, status: order.status, updatedAt: order.updatedAt, createdBy: finance?.createdBy ?? null,
        internalNotes: finance?.internalNotes ?? "", discount: order.discount, hasCustomer: true,
        customerRef: order.userId === NO_CUSTOMER_OWNER ? null : order.userId.startsWith("painel:") ? order.userId : `conta:${order.userId}`,
        customerProfessional: isProfessional(deps.database(), order.userId),
        customer: { name: order.customer.name, company: order.customer.company ?? "", phone: order.customer.phone ?? "", notes: order.customer.notes ?? "" },
        items, products, paidCents: finance?.paidCents ?? 0,
      });
    },

    /** Salva os itens do pedido; pagamento e entrega continuam na página do pedido. */
    async updateOrder(request: Request, orderId: string) {
      const access = await staff(deps, request);
      if (access.error) return access.error;
      const rejected = financialMutationGuard(request);
      if (rejected) return rejected;
      const body = await readJson(request);
      if (!body) return json({ error: "INVALID_REQUEST" }, 400);
      const order = findOrderById(deps.database(), orderId);
      if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404);
      try {
        const drafts = parseDraftItems(body.items);
        const discount = "discount" in body ? parseDiscount(body.discount) : undefined;
        const catalog = await deps.catalog();
        const { items, preview } = buildQuoteItems(drafts, catalog.lookup, { name: access.session.user.name });
        if (items.length !== drafts.length) return json({ error: "INVALID_ITEMS", preview }, 422);
        // Itens que não mudaram mantêm quem formou o preço e quando; o mockup fica com o item.
        const previous = new Map(order.items.map((item) => [item.id, item]));
        const merged = items.map((item) => {
          const before = previous.get(item.id);
          const same = before?.costing && before.unitPrice === item.unitPrice && before.quantity === item.quantity
            && JSON.stringify(draftFromItem(before)) === JSON.stringify(draftFromItem(item));
          const kept = !item.mockup && before?.mockup ? { ...item, mockup: before.mockup } : item;
          return same && before.costing && item.costing ? { ...kept, costing: { ...item.costing, por: before.costing.por, em: before.costing.em } } : kept;
        });
        const updated = replaceOrderItems(deps.database(), {
          orderId, items: merged, discount, expectedUpdatedAt: String(body.updatedAt ?? ""),
          ...(typeof body.internalNotes === "string" ? { internalNotes: body.internalNotes.trim().slice(0, 2000) } : {}),
        });
        return json({ id: updated.id, updatedAt: updated.updatedAt, orderStatus: updated.status });
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
    deliveryDate: quote.deliveryDate,
    deliveryTime: quote.deliveryTime,
    hasCustomer: quote.userId !== NO_CUSTOMER_OWNER,
    customerRef: quote.userId === NO_CUSTOMER_OWNER ? null : quote.userId.startsWith("painel:") ? quote.userId : `conta:${quote.userId}`,
    customer: { name: quote.customer.name, company: quote.customer.company ?? "", phone: quote.customer.phone ?? "", notes: quote.customer.notes ?? "" },
    items: quote.items.map(draftFromItem),
  };
}
