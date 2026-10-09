import { buildQuoteMessage, buildWhatsAppUrl, type QuoteBilling, type QuoteCartItem, type QuoteCustomer } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { PAYMENT_METHOD_LABELS } from "@/lib/orders/labels";
import { orderCode } from "@/lib/orders/orderCode";
import type { SessionReader } from "@/lib/auth/session";
import type { CreateOrderInput, Order, PaymentMethod } from "@/lib/orders/repository";
import { PAYMENT_METHODS } from "@/lib/orders/repository";
import { quoteCode } from "@/lib/quotes/quoteCode";
import type { CreateQuoteInput, Quote } from "@/lib/quotes/repository";

const NEWLINE = String.fromCharCode(10);

export type CheckoutSession = { user: { id: string } };
export type CheckoutBody = {
  customer: QuoteCustomer;
  items: QuoteCartItem[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
};
export type PersistOrder = (
  input: CreateOrderInput,
) => Pick<Order, "id" | "status" | "paymentMethod" | "customer" | "items">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBoundedString(value: unknown, maxLength: number, required = false): value is string {
  return typeof value === "string" && value.length <= maxLength && (!required || value.trim().length > 0);
}

function isOptionalString(value: unknown, maxLength: number): value is string | null | undefined {
  return value === undefined || value === null || isBoundedString(value, maxLength);
}

function isCustomer(value: unknown): value is QuoteCustomer {
  if (!isRecord(value)) return false;
  return isBoundedString(value.name, 120, true)
    && isBoundedString(value.phone, 30, true)
    && isOptionalString(value.company, 160)
    && isOptionalString(value.notes, 2000);
}

function isSelections(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= 50
    && entries.every(([label, selection]) => label.length > 0 && label.length <= 100 && isBoundedString(selection, 300, true));
}

function isCartItem(value: unknown): value is QuoteCartItem {
  if (!isRecord(value)) return false;
  const priceValid = value.unitPrice === null
    || (typeof value.unitPrice === "number"
      && Number.isFinite(value.unitPrice)
      && value.unitPrice >= 0
      && value.unitPrice <= 1_000_000);
  return isBoundedString(value.id, 128, true)
    && isBoundedString(value.productName, 200, true)
    && isBoundedString(value.slug, 200, true)
    && typeof value.quantity === "number"
    && Number.isInteger(value.quantity)
    && value.quantity > 0
    && value.quantity <= 1_000_000
    && isOptionalString(value.quantityRange, 100)
    && isSelections(value.selections)
    && isOptionalString(value.artworkName, 255)
    && priceValid;
}

export type QuoteRequestBody = Omit<CheckoutBody, "paymentMethod">;

/** Cliente + itens + chave anti-duplicação (comum a pedido e orçamento). */
function isQuoteRequestBody(value: unknown): value is QuoteRequestBody {
  if (!isRecord(value)) return false;
  return isCustomer(value.customer)
    && Array.isArray(value.items)
    && value.items.length > 0
    && value.items.length <= 100
    && value.items.every(isCartItem)
    && typeof value.idempotencyKey === "string"
    && /^[A-Za-z0-9_-]{8,128}$/.test(value.idempotencyKey);
}

function isCheckoutBody(value: unknown): value is CheckoutBody {
  return isQuoteRequestBody(value)
    && typeof (value as Record<string, unknown>).paymentMethod === "string"
    && PAYMENT_METHODS.includes((value as Record<string, unknown>).paymentMethod as PaymentMethod);
}

/** Guarda WhatsApp/empresa do pedido na conta (só completa o que ainda está vazio). */
export type RememberContact = (userId: string, customer: QuoteCustomer) => void;
/** Dados de faturamento do cadastro da conta; null quando o cadastro está incompleto. */
export type ReadBilling = (userId: string) => QuoteBilling | null;

export type CheckoutOptions = {
  rememberContact?: RememberContact;
  readBilling?: ReadBilling;
  /** Recalcula os preços no servidor (o navegador não define o valor do pedido). */
  priceItems?: (items: QuoteCartItem[]) => Promise<QuoteCartItem[]> | QuoteCartItem[];
};

/** Só os campos do formulário; qualquer outro campo enviado pelo navegador (ex.: billing) é descartado. */
function pickCustomer(customer: QuoteCustomer): QuoteCustomer {
  const picked: QuoteCustomer = { name: customer.name };
  if (customer.company) picked.company = customer.company;
  if (customer.phone) picked.phone = customer.phone;
  if (customer.notes) picked.notes = customer.notes;
  return picked;
}

export function createCheckoutHandler(
  getSession: SessionReader<CheckoutSession>,
  persistOrder: PersistOrder,
  { rememberContact, readBilling, priceItems }: CheckoutOptions = {},
) {
  return async function checkout(request: Request): Promise<Response> {
    const session = await getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    if (!isCheckoutBody(body)) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const customer = pickCustomer(body.customer);

    let items: QuoteCartItem[];
    try {
      items = priceItems ? await priceItems(body.items) : body.items;
    } catch (error) {
      console.error("[checkout] não foi possível conferir os preços no catálogo", error);
      return Response.json({ error: "PRICING_UNAVAILABLE" }, { status: 503 });
    }

    try {
      const billing = readBilling?.(session.user.id);
      if (billing) customer.billing = billing;
    } catch (error) {
      // Sem os dados da nota o pedido segue; a equipe confirma no WhatsApp.
      console.error("[checkout] não foi possível ler o cadastro do cliente", error);
    }

    let order: ReturnType<PersistOrder>;
    try {
      order = persistOrder({
        userId: session.user.id,
        idempotencyKey: body.idempotencyKey,
        customer,
        items,
        paymentMethod: body.paymentMethod,
      });
    } catch {
      return Response.json({ error: "ORDER_CREATION_FAILED" }, { status: 500 });
    }
    try {
      rememberContact?.(session.user.id, body.customer);
    } catch (error) {
      // O pedido já foi salvo; não guardar o contato não pode impedir o cliente de seguir.
      console.error("[checkout] não foi possível guardar o contato do cliente", error);
    }
    const message = [
      `Pedido #${orderCode(order.id)}`,
      `Pagamento informado: ${PAYMENT_METHOD_LABELS[order.paymentMethod]}`,
      "",
      buildQuoteMessage(order.customer, order.items),
    ].join("\n");

    return Response.json({
      orderId: order.id,
      status: order.status,
      url: buildWhatsAppUrl(FARE_FOTO_WHATSAPP, message),
    });
  };
}

export type PersistQuote = (input: CreateQuoteInput) => Pick<Quote, "id" | "status" | "customer" | "items">;

/**
 * "Só quero um orçamento": mesmas regras do pedido (login, preço do servidor, faturamento do
 * cadastro), sem forma de pagamento. Fica na aba Orçamentos e a equipe responde no WhatsApp.
 */
export function createQuoteHandler(
  getSession: SessionReader<CheckoutSession>,
  persistQuote: PersistQuote,
  { readBilling, priceItems }: Pick<CheckoutOptions, "readBilling" | "priceItems"> = {},
) {
  return async function requestQuote(request: Request): Promise<Response> {
    const session = await getSession({ headers: request.headers });
    if (!session) return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    if (!isQuoteRequestBody(body)) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const customer = pickCustomer(body.customer);
    let items: QuoteCartItem[];
    try {
      items = priceItems ? await priceItems(body.items) : body.items;
    } catch (error) {
      console.error("[orçamento] não foi possível conferir os preços no catálogo", error);
      return Response.json({ error: "PRICING_UNAVAILABLE" }, { status: 503 });
    }
    try {
      const billing = readBilling?.(session.user.id);
      if (billing) customer.billing = billing;
    } catch (error) {
      console.error("[orçamento] não foi possível ler o cadastro do cliente", error);
    }

    let quote: ReturnType<PersistQuote>;
    try {
      quote = persistQuote({ userId: session.user.id, idempotencyKey: body.idempotencyKey, customer, items });
    } catch {
      return Response.json({ error: "QUOTE_CREATION_FAILED" }, { status: 500 });
    }

    const message = [`Orçamento #${quoteCode(quote.id)}`, "", buildQuoteMessage(quote.customer, quote.items)].join(NEWLINE);
    return Response.json({ quoteId: quote.id, status: quote.status, url: buildWhatsAppUrl(FARE_FOTO_WHATSAPP, message) });
  };
}
