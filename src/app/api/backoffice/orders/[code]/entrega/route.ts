import { database } from "@/lib/auth";
import { readStaffSession } from "@/lib/staff/server";
import { createUpdateOrderDeliveryHandler } from "@/lib/backoffice/orderPaymentHandlers";
export const dynamic = "force-dynamic";
const update = createUpdateOrderDeliveryHandler({ database: () => database, getSession: readStaffSession as never });
export async function PATCH(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  return update(request, code);
}
