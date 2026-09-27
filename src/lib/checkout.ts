import { buildQuoteMessage, buildWhatsAppUrl, type QuoteCartItem, type QuoteCustomer } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import type { SessionReader } from "@/lib/auth/session";

type CheckoutSession = { user: { id: string } };
type CheckoutBody = { customer: QuoteCustomer; items: QuoteCartItem[] };

function isCheckoutBody(value: unknown): value is CheckoutBody {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CheckoutBody>;
  return Boolean(
    body.customer
    && typeof body.customer.name === "string"
    && body.customer.name.trim()
    && Array.isArray(body.items)
    && body.items.length > 0,
  );
}

export function createCheckoutHandler(getSession: SessionReader<CheckoutSession>) {
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

    const message = buildQuoteMessage(body.customer, body.items);
    return Response.json({ url: buildWhatsAppUrl(FARE_FOTO_WHATSAPP, message) });
  };
}
