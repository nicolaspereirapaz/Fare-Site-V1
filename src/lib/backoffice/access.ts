import type { SessionReader } from "@/lib/auth/session";
import { discountLine } from "@/lib/quotes/discount";
import { DEFAULT_USER_ROLE, isUserRole, type UserRole } from "@/lib/auth/roles";
import { ORDEM_STATUS_PEDIDO, TransicaoStatusPedidoInvalidaError, type StatusPedido } from "@/lib/backoffice/orderStatus";
import type { QuoteBilling, QuoteCartItem } from "@/lib/commerce";
import { orderCode } from "@/lib/orders/orderCode";
import type { Order } from "@/lib/orders/repository";
import type { OrderFinance } from "@/lib/orders/payments";

export type BackofficeSession = { user: { id: string; role?: unknown } };

export type ListOrders = () => Order[];
/** Histórico mostrado nos detalhes: para qual situação foi, quando e quem mudou. */
export type OrderHistoryEntry = { status: StatusPedido; from?: StatusPedido; at: string; by: string };
export type ListOrderHistory = (order: Order) => OrderHistoryEntry[];
export type FindOrder = (orderId: string) => Order | null;
export type ChangeOrderStatus = (input: {
  orderId: string;
  nextStatus: StatusPedido;
  actorId: string;
}) => Order;

export type BackofficeOrderSummary = {
  id: string;
  /** Número curto mostrado ao cliente e no WhatsApp (ex.: FF-3F7A2C). */
  code: string;
  status: StatusPedido;
  paymentMethod: Order["paymentMethod"];
  customerName: string;
  customerPhone: string;
  customerCompany: string | null;
  notes: string | null;
  /** Dados da nota gravados no pedido no momento da compra; null se o cadastro estava incompleto. */
  billing: QuoteBilling | null;
  items: Array<{ productName: string; quantity: number; selections: Record<string, string>; unitPrice: number | null; codes?: QuoteCartItem["codes"] }>;
  itemCount: number;
  /** Pedido de fotos do site (itens "fotos/…"). */
  photos?: boolean;
  total: number;
  /** Desconto vindo do orçamento (rótulo e valor). */
  discount: { label: string; amount: number } | null;
  createdAt: string;
  /** Versão do pedido (fechar pedido do site recusa se mudou no meio). */
  updatedAt: string;
  history: OrderHistoryEntry[];
  finance?: OrderFinance | null;
};

export function resolveUserRole(user: { role?: unknown } | null | undefined): UserRole {
  return isUserRole(user?.role) ? user.role : DEFAULT_USER_ROLE;
}

export function hasBackofficeAccess(role: UserRole): boolean {
  return role === "vendedor" || role === "admin";
}

/** Toda a equipe cancela pedido (a tela pede confirmação antes). */
export function canCancelOrders(role: UserRole): boolean {
  return hasBackofficeAccess(role);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStatusPedido(value: unknown): value is StatusPedido {
  return typeof value === "string" && (ORDEM_STATUS_PEDIDO as readonly string[]).includes(value);
}

const isPhotoOrder = (order: Order) => order.items.some((item) => item.slug.startsWith("fotos/"));

function calculateOrderSummaryTotal(items: Order["items"]): number {
  const cents = Math.round(
    items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0) * 100,
  );
  return cents / 100;
}

function toBackofficeOrderSummary(order: Order, history: OrderHistoryEntry[] = [], finance: OrderFinance | null = null): BackofficeOrderSummary {
  return {
    id: order.id,
    code: orderCode(order.id),
    status: order.status,
    paymentMethod: order.paymentMethod,
    customerName: order.customer.name,
    customerPhone: order.customer.phone ?? "",
    customerCompany: order.customer.company ?? null,
    notes: order.customer.notes || null,
    billing: order.customer.billing ?? null,
    items: order.items.map(({ productName, quantity, selections, unitPrice, codes }) => ({ productName, quantity, selections, unitPrice, codes })),
    itemCount: order.items.length,
    // Pedido de fotos do site (itens "fotos/…"): etiqueta própria no quadro.
    photos: isPhotoOrder(order),
    // Pedido vindo de orçamento com desconto: o total gravado já está descontado.
    total: order.discount && order.totalCents !== null ? order.totalCents / 100 : calculateOrderSummaryTotal(order.items),
    discount: discountLine(order.discount, order.items),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    history,
    ...(finance ? { finance } : {}),
  };
}

function buildStatusCounts(orders: Order[]): Record<StatusPedido, number> {
  const counts = Object.fromEntries(
    ORDEM_STATUS_PEDIDO.map((status) => [status, 0]),
  ) as Record<StatusPedido, number>;

  for (const order of orders) counts[order.status] += 1;

  return counts;
}

export function createListBackofficeOrdersHandler(
  getSession: SessionReader<BackofficeSession>,
  listOrders: ListOrders,
  listHistory: ListOrderHistory = () => [],
  readFinance: (order: Order) => OrderFinance | null = () => null,
) {
  return async function listBackofficeOrders(request: Request): Promise<Response> {
    const session = await getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const role = resolveUserRole(session.user);
    if (!hasBackofficeAccess(role)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const orders = listOrders();

    return Response.json({
      orders: orders.map((order) => toBackofficeOrderSummary(order, listHistory(order), readFinance(order))),
      counts: buildStatusCounts(orders),
    });
  };
}

export function createUpdateBackofficeOrderStatusHandler(
  getSession: SessionReader<BackofficeSession>,
  findOrder: FindOrder,
  changeOrderStatus: ChangeOrderStatus,
  readFinance: (order: Order) => OrderFinance | null = () => null,
) {
  return async function updateBackofficeOrderStatus(request: Request, orderId: string): Promise<Response> {
    const session = await getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }

    const role = resolveUserRole(session.user);
    if (!hasBackofficeAccess(role)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    if (!isRecord(body) || !isStatusPedido(body.status)) {
      return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    let nextStatus = body.status;
    if (nextStatus === "cancelado" && !canCancelOrders(role)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const order = findOrder(orderId);
    if (!order) {
      return Response.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
    }

    const finance = readFinance(order);
    if (finance && order.status === "aguardando_pagamento" && nextStatus === "aguardando_arte" && finance.paidCents <= 0) {
      return Response.json({ error: "INVALID_TRANSITION", message: "Registre um recebimento para liberar a arte." }, { status: 409 });
    }
    // "Pagamento recebido" num pedido de fotos: não há arte, segue direto para "Aguardando produção".
    if (order.status === "aguardando_pagamento" && nextStatus === "aguardando_arte" && isPhotoOrder(order)) {
      nextStatus = "aguardando_producao";
    }
    let updated: Order;
    try {
      updated = changeOrderStatus({ orderId, nextStatus, actorId: session.user.id });
    } catch (error) {
      if (error instanceof TransicaoStatusPedidoInvalidaError) {
        return Response.json({ error: "INVALID_TRANSITION" }, { status: 409 });
      }
      throw error;
    }

    return Response.json({ order: toBackofficeOrderSummary(updated, [], readFinance(updated)) });
  };
}
