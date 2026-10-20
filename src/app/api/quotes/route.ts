import { database } from "@/lib/auth";
import { getStoreSession } from "@/lib/auth/storeSession";
import { createQuoteHandler } from "@/lib/checkout";
import { checkoutServerDeps } from "@/lib/checkoutServerDeps";
import { createQuote } from "@/lib/quotes/repository";

const { priceItems, readBilling, rememberContact } = checkoutServerDeps;
const handler = createQuoteHandler(getStoreSession, (input) => createQuote(database, input), { priceItems, readBilling });

export async function POST(request: Request) {
  const response = await handler(request.clone());
  // Como no pedido: o 1º orçamento completa o WhatsApp/empresa da conta.
  if (response.ok) {
    try {
      const session = await getStoreSession({ headers: request.headers });
      const body = await request.json() as { customer?: { name: string; phone?: string; company?: string } };
      if (session && body.customer) rememberContact(session.user.id, body.customer);
    } catch (error) {
      console.error("[orçamento] não foi possível guardar o contato do cliente", error);
    }
  }
  return response;
}
