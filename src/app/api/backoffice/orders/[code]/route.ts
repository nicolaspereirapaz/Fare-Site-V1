import { readOrderDocument } from "@/lib/backoffice/documentDetailServer";
import { database } from "@/lib/auth";
import { readStaffSession } from "@/lib/staff/server";
import { createUpdateBackofficeOrderStatusHandler } from "@/lib/backoffice/access";
import { findOrderById, updateOrderStatus } from "@/lib/orders/repository";
import { getOrderFinance } from "@/lib/orders/payments";

export const dynamic = "force-dynamic";

const updateBackofficeOrderStatus = createUpdateBackofficeOrderStatusHandler(
  readStaffSession,
  (orderId) => findOrderById(database, orderId),
  (input) => updateOrderStatus(database, input),
  (order) => getOrderFinance(database, order.id),
);

export async function PATCH(request: Request, context: RouteContext<"/api/backoffice/orders/[code]">) {
  const { code } = await context.params;
  return updateBackofficeOrderStatus(request, code);
}
export async function GET(request: Request, context: RouteContext<"/api/backoffice/orders/[code]">) {
  return readOrderDocument(request, (await context.params).code);
}
