import { database } from "@/lib/auth";
import { staffAuth } from "@/lib/staff/auth";
import { createUpdateBackofficeOrderStatusHandler } from "@/lib/backoffice/access";
import { findOrderById, updateOrderStatus } from "@/lib/orders/repository";

export const dynamic = "force-dynamic";

const updateBackofficeOrderStatus = createUpdateBackofficeOrderStatusHandler(
  staffAuth.api.getSession,
  (orderId) => findOrderById(database, orderId),
  (input) => updateOrderStatus(database, input),
);

export async function PATCH(request: Request, context: RouteContext<"/api/backoffice/orders/[code]">) {
  const { code } = await context.params;
  return updateBackofficeOrderStatus(request, code);
}
