import type { DatabaseSync } from "node:sqlite";
import type { SessionReader } from "@/lib/auth/session";
import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { financialMutationGuard } from "@/lib/backoffice/financialMutationGuard";
import { closeQuote, CloseQuoteError, type CloseQuoteInput } from "@/lib/quotes/closeQuote";
import { closeSiteOrder, type CloseSiteOrderInput } from "@/lib/orders/payments";
import { orderCode } from "@/lib/orders/orderCode";
import { movePhotoFoldersToOrder } from "@/lib/photoLinks/links";

export type CloseQuoteDeps = {
  database: () => DatabaseSync;
  getSession: SessionReader<{ user: { id: string; name: string; role?: unknown } }>;
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function exactObject(raw: unknown, keys: string[]): raw is Record<string, unknown> {
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw)
    && Object.keys(raw).length === keys.length && keys.every(key => Object.hasOwn(raw, key)));
}

export function createCloseQuoteHandler(deps: CloseQuoteDeps) {
  return async function handle(request: Request, quoteId: string): Promise<Response> {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
    const rejected = financialMutationGuard(request);
    if (rejected) return rejected;
    let raw: unknown;
    try { raw = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
    const keys = ["idempotencyKey", "expectedUpdatedAt", "paymentMethod", "payment", "installments", "dueDate", "deliveryDate", "deliveryMode"];
    if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'paymentOnPickup')) keys.push('paymentOnPickup');
    if (raw && typeof raw === 'object' && Object.hasOwn(raw, 'deliveryTime')) keys.push('deliveryTime');
    if (!exactObject(raw, keys)
      || !exactObject(raw.payment, ["amountCents", "paidAt"])
      || (raw.paymentOnPickup !== undefined && typeof raw.paymentOnPickup !== 'boolean')
      || typeof raw.idempotencyKey !== "string" || raw.idempotencyKey.length < 8 || raw.idempotencyKey.length > 80
      || typeof raw.expectedUpdatedAt !== "string" || !raw.expectedUpdatedAt) {
      return json({ error: "INVALID_REQUEST", message: "Dados de fechamento inválidos." }, 400);
    }
    try {
      const order = closeQuote(deps.database(), {
        quoteId, idempotencyKey: raw.idempotencyKey, expectedUpdatedAt: raw.expectedUpdatedAt,
        actorId: session.user.id, actorName: session.user.name,
        payment: { ...raw.payment, paymentMethod: raw.paymentMethod, installments: raw.installments, dueDate: raw.dueDate } as CloseQuoteInput["payment"],
        delivery: { deliveryDate: raw.deliveryDate, deliveryMode: raw.deliveryMode, deliveryTime: raw.deliveryTime ?? null } as CloseQuoteInput["delivery"],
        paymentOnPickup: raw.paymentOnPickup === true,
      });
      // Pasta das fotos do orçamento passa a ser do pedido; falha aqui não desfaz o pedido.
      await movePhotoFoldersToOrder(deps.database(), quoteId, order.id).catch((error) => console.error("[fotos] pasta do orçamento", error));
      return json({ order: { id: order.id, code: orderCode(order.id), status: order.status } });
    } catch (error) {
      if (error instanceof CloseQuoteError) return json({ error: error.reason, message: error.message }, error.reason === "QUOTE_NOT_FOUND" ? 404 : error.reason === "CONFLICT" ? 409 : 400);
      if (error instanceof Error && !("code" in error)) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
      console.error("Falha ao fechar orçamento", error);
      return json({ error: "INTERNAL_ERROR", message: "Não foi possível fechar o orçamento. Tente novamente." }, 500);
    }
  };
}

/** Fechar pedido do site (carrinho/fotos): mesmos campos do "Fechar Orçamento". */
export function createCloseSiteOrderHandler(deps: CloseQuoteDeps) {
  return async function handle(request: Request, orderId: string): Promise<Response> {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
    const rejected = financialMutationGuard(request);
    if (rejected) return rejected;
    let raw: Record<string, unknown>;
    try { raw = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
    if (!raw || typeof raw !== "object" || typeof raw.expectedUpdatedAt !== "string" || !exactObject(raw.payment, ["amountCents", "paidAt"])
      || (raw.paymentOnPickup !== undefined && typeof raw.paymentOnPickup !== "boolean")) {
      return json({ error: "INVALID_REQUEST", message: "Dados de fechamento inválidos." }, 400);
    }
    try {
      const order = closeSiteOrder(deps.database(), {
        orderId, expectedUpdatedAt: raw.expectedUpdatedAt, actorId: session.user.id, actorName: session.user.name,
        paymentMethod: raw.paymentMethod, payment: raw.payment, installments: raw.installments ?? null, dueDate: raw.dueDate ?? null,
        deliveryDate: raw.deliveryDate ?? null, deliveryMode: raw.deliveryMode, deliveryTime: raw.deliveryTime ?? null,
        paymentOnPickup: raw.paymentOnPickup === true,
      } as CloseSiteOrderInput);
      return json({ order: { id: order.id, code: orderCode(order.id), status: order.status } });
    } catch (error) {
      if (error instanceof Error && !("code" in error)) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
      console.error("Falha ao fechar pedido do site", error);
      return json({ error: "INTERNAL_ERROR", message: "Não foi possível fechar o pedido. Tente novamente." }, 500);
    }
  };
}
