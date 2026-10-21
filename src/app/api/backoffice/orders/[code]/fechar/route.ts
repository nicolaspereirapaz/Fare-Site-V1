import { database } from "@/lib/auth";
import { readStaffSession } from "@/lib/staff/server";
import { createCloseSiteOrderHandler } from "@/lib/backoffice/closeQuoteHandlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const close = createCloseSiteOrderHandler({ database: () => database, getSession: readStaffSession });

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  return close(request, (await context.params).code);
}
