import { database } from "@/lib/auth";
import { staffAuth } from "@/lib/staff/auth";
import { createRecordOrderPaymentHandler } from "@/lib/backoffice/orderPaymentHandlers";
export const dynamic = "force-dynamic";
const receive = createRecordOrderPaymentHandler({ database: () => database, getSession: staffAuth.api.getSession as never });
export async function POST(request: Request, context: RouteContext<"/api/backoffice/orders/[code]/pagamentos">) {
  const { code } = await context.params;
  return receive(request, code);
}
