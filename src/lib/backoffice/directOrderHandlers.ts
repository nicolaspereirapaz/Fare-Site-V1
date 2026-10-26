import { hasBackofficeAccess, resolveUserRole } from "@/lib/backoffice/access";
import { buildQuoteItems, parseDraftItems } from "@/lib/backoffice/quoteBuilder";
import { customerSnapshot, type QuoteBuilderDeps } from "@/lib/backoffice/quoteBuilderHandlers";
import { createDirectOrder, STAFF_PAYMENT_METHODS, type DirectOrderInput } from "@/lib/orders/payments";
import { orderCode } from "@/lib/orders/orderCode";
import { parseDiscount } from "@/lib/quotes/discount";
import { financialMutationGuard } from "@/lib/backoffice/financialMutationGuard";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export function createDirectOrderHandler(deps: QuoteBuilderDeps) {
  return async function create(request: Request): Promise<Response> {
    const session = await deps.getSession({ headers: request.headers });
    if (!session) return json({ error: "AUTH_REQUIRED" }, 401);
    if (!hasBackofficeAccess(resolveUserRole(session.user))) return json({ error: "FORBIDDEN" }, 403);
    const rejected = financialMutationGuard(request);
    if (rejected) return rejected;
    let raw: unknown;
    try { raw = await request.json(); } catch { return json({ error: "INVALID_REQUEST" }, 400); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ error: "INVALID_REQUEST" }, 400);
    const body = raw as Record<string, unknown>;
    if (typeof body.idempotencyKey !== "string" || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 80) return json({ error: "INVALID_REQUEST", message: "Chave do envio inválida." }, 400);
    if (typeof body.customerRef !== "string" || !body.customerRef) return json({ error: "INVALID_REQUEST", message: "Selecione o cliente." }, 400);
    const owner = customerSnapshot(deps, body.customerRef);
    if (!owner) return json({ error: "INVALID_REQUEST", message: "Cliente não encontrado. Escolha de novo." }, 400);
    if (!STAFF_PAYMENT_METHODS.includes(body.paymentMethod as DirectOrderInput["paymentMethod"])) return json({ error: "INVALID_REQUEST", message: "Forma de pagamento inválida." }, 400);
    const receipt = body.payment as Record<string, unknown> | undefined;
    if (!receipt || !Number.isSafeInteger(receipt.amountCents) || typeof receipt.amountCents !== "number" || receipt.amountCents < 0) return json({ error: "INVALID_REQUEST", message: "Valor pago inválido." }, 400);
    if (body.paymentOnPickup !== undefined && typeof body.paymentOnPickup !== "boolean") return json({ error: "INVALID_REQUEST", message: "Condição de pagamento inválida." }, 400);
    try {
      const drafts = parseDraftItems(body.items);
      const discount = parseDiscount(body.discount);
      const catalog = await deps.catalog();
      const { items, preview } = buildQuoteItems(drafts, catalog.lookup, { name: session.user.name });
      if (items.length !== drafts.length) return json({ error: "INVALID_ITEMS", preview }, 422);
      const order = createDirectOrder(deps.database(), {
        userId: owner.ownerId, customer: owner.customer, items, discount, idempotencyKey: body.idempotencyKey,
        paymentMethod: body.paymentMethod as DirectOrderInput["paymentMethod"],
        actorId: session.user.id, actorName: session.user.name,
        internalNotes: typeof body.internalNotes === "string" ? body.internalNotes.trim().slice(0, 2000) : "",
        payment: { amountCents: receipt.amountCents, paidAt: receipt.paidAt as string | null },
        installments: body.installments as number | null, dueDate: body.dueDate as string | null,
        deliveryDate: body.deliveryDate as string | null, deliveryMode: body.deliveryMode as DirectOrderInput["deliveryMode"],
        deliveryTime: (body.deliveryTime ?? null) as string | null,
        paymentOnPickup: body.paymentOnPickup === true,
      });
      return json({ id: order.id, code: orderCode(order.id), orderStatus: order.status }, 201);
    } catch (error) {
      // As validações de domínio são para o atendente; detalhes SQLite não vão ao cliente.
      if (error instanceof Error && !('code' in error)) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
      console.error("Falha ao criar pedido direto", error);
      return json({ error: "INTERNAL_ERROR", message: "Não foi possível salvar o pedido. Tente novamente." }, 500);
    }
  };
}
