import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import type { QuoteBuilderDeps } from "@/lib/backoffice/quoteBuilderHandlers";
import { findOrderById } from "@/lib/orders/repository";
import { getOrderFinance, recordOrderPayment, STAFF_PAYMENT_METHODS } from "@/lib/orders/payments";
import { financialMutationGuard } from "@/lib/backoffice/financialMutationGuard";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function createRecordOrderPaymentHandler(deps: Pick<QuoteBuilderDeps, "database" | "getSession">) {
  return async function receive(request: Request, orderId: string): Promise<Response> {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
    const rejected = financialMutationGuard(request);
    if (rejected) return rejected;
    const db = deps.database();
    if (!findOrderById(db, orderId)) return json({ error: "ORDER_NOT_FOUND" }, 404);
    if (!getOrderFinance(db, orderId)) return json({ error: "INVALID_REQUEST", message: "Este pedido não tem registro financeiro de pedido direto." }, 400);
    let raw: unknown;
    try { raw = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ error: "INVALID_REQUEST" }, 400);
    const body = raw as Record<string, unknown>;
    if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 80
      || typeof body.amountCents !== "number" || !Number.isSafeInteger(body.amountCents) || body.amountCents <= 0
      || typeof body.paidAt !== "string" || !STAFF_PAYMENT_METHODS.includes(body.paymentMethod as Parameters<typeof recordOrderPayment>[1]["paymentMethod"])) return json({ error: "INVALID_REQUEST", message: "Confira valor, forma e data do recebimento." }, 400);
    try {
      const finance = recordOrderPayment(db, { orderId, idempotencyKey: body.idempotencyKey, amountCents: body.amountCents,
        paymentMethod: body.paymentMethod as Parameters<typeof recordOrderPayment>[1]["paymentMethod"], paidAt: body.paidAt,
        actorId: session.user.id, actorName: session.user.name });
      return json({ finance }, 201);
    } catch (error) {
      if (error instanceof Error && !('code' in error)) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
      console.error("Falha ao registrar recebimento", error);
      return json({ error: "INTERNAL_ERROR", message: "Não foi possível registrar o pagamento. Tente novamente." }, 500);
    }
  };
}
