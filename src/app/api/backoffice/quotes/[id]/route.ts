import { database } from "@/lib/auth";
import { staffAuth } from "@/lib/staff/auth";
import { createUpdateBackofficeQuoteStatusHandler } from "@/lib/backoffice/quotesAccess";
import { convertQuoteToOrder, findQuoteById, updateQuoteStatus } from "@/lib/quotes/repository";

export const dynamic = "force-dynamic";

const updateQuote = createUpdateBackofficeQuoteStatusHandler(
  staffAuth.api.getSession,
  (quoteId) => findQuoteById(database, quoteId),
  // "Pagamento recebido" cria o pedido (em Criando arte) junto; o resto só troca a situação.
  ({ quoteId, nextStatus, actorId }) => (nextStatus === "virou_pedido"
    ? convertQuoteToOrder(database, { quoteId, actorId }).quote
    : updateQuoteStatus(database, { quoteId, nextStatus })),
);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return updateQuote(request, id);
}
