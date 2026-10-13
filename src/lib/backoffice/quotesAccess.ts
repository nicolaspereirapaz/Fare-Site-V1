import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole, type BackofficeSession } from "@/lib/backoffice/access";
import type { QuoteBilling, QuoteCartItem } from "@/lib/commerce";
import { InvalidQuoteTransitionError, isQuoteStatus, QUOTE_STATUSES, quoteCode, type QuoteStatus } from "@/lib/quotes/quoteCode";
import type { Quote } from "@/lib/quotes/repository";

export type BackofficeQuoteSummary = {
  id: string;
  code: string;
  status: QuoteStatus;
  customerName: string;
  customerPhone: string;
  customerCompany: string | null;
  notes: string | null;
  billing: QuoteBilling | null;
  items: Array<{ productName: string; quantity: number; selections: Record<string, string>; unitPrice: number | null; codes?: QuoteCartItem["codes"]; costing?: QuoteCartItem["costing"] }>;
  itemCount: number;
  /** null quando algum item está "sob consulta". */
  total: number | null;
  createdAt: string;
};

function toSummary(quote: Quote): BackofficeQuoteSummary {
  return {
    id: quote.id,
    code: quoteCode(quote.id),
    status: quote.status,
    customerName: quote.customer.name,
    customerPhone: quote.customer.phone ?? "",
    customerCompany: quote.customer.company ?? null,
    notes: quote.customer.notes || null,
    billing: quote.customer.billing ?? null,
    items: quote.items.map(({ productName, quantity, selections, unitPrice, codes, costing }) => ({ productName, quantity, selections, unitPrice, codes, ...(costing ? { costing } : {}) })),
    itemCount: quote.items.length,
    total: quote.totalCents === null ? null : quote.totalCents / 100,
    createdAt: quote.createdAt,
  };
}

async function staffOnly(getSession: SessionReader<BackofficeSession>, request: Request) {
  const session = await getSession({ headers: request.headers });
  if (!session) return { error: Response.json({ error: "AUTH_REQUIRED" }, { status: 401 }) };
  if (!hasBackofficeAccess(resolveUserRole(session.user))) return { error: Response.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { session };
}

export function createListBackofficeQuotesHandler(getSession: SessionReader<BackofficeSession>, listQuotes: () => Quote[]) {
  return async function listBackofficeQuotes(request: Request): Promise<Response> {
    const access = await staffOnly(getSession, request);
    if (access.error) return access.error;

    const quotes = listQuotes();
    const counts = Object.fromEntries(QUOTE_STATUSES.map((status) => [status, 0])) as Record<QuoteStatus, number>;
    for (const quote of quotes) counts[quote.status] += 1;
    return Response.json({ quotes: quotes.map(toSummary), counts });
  };
}

export function createUpdateBackofficeQuoteStatusHandler(
  getSession: SessionReader<BackofficeSession>,
  findQuote: (quoteId: string) => Quote | null,
  changeStatus: (input: { quoteId: string; nextStatus: QuoteStatus; actorId: string }) => Quote,
) {
  return async function updateBackofficeQuoteStatus(request: Request, quoteId: string): Promise<Response> {
    const access = await staffOnly(getSession, request);
    if (access.error) return access.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const nextStatus = (body as { status?: unknown } | null)?.status;
    if (!isQuoteStatus(nextStatus)) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    if (!findQuote(quoteId)) return Response.json({ error: "QUOTE_NOT_FOUND" }, { status: 404 });

    try {
      return Response.json({ quote: toSummary(changeStatus({ quoteId, nextStatus, actorId: access.session.user.id })) });
    } catch (error) {
      if (error instanceof InvalidQuoteTransitionError) return Response.json({ error: "INVALID_TRANSITION" }, { status: 409 });
      throw error;
    }
  };
}
