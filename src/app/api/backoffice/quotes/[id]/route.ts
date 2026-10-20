import { readQuoteDocument } from "@/lib/backoffice/documentDetailServer";
import { database } from "@/lib/auth";
import { readStaffSession } from "@/lib/staff/server";
import { createUpdateBackofficeQuoteStatusHandler } from "@/lib/backoffice/quotesAccess";
import { findQuoteById, updateQuoteStatus } from "@/lib/quotes/repository";

export const dynamic = "force-dynamic";

const updateQuote = createUpdateBackofficeQuoteStatusHandler(
  readStaffSession,
  (quoteId) => findQuoteById(database, quoteId),
  ({ quoteId, nextStatus }) => updateQuoteStatus(database, { quoteId, nextStatus }),
);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return updateQuote(request, id);
}
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return readQuoteDocument(request, (await context.params).id);
}
