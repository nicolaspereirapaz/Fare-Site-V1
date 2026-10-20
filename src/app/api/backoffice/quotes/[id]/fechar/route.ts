import { database } from "@/lib/auth";
import { readStaffSession } from "@/lib/staff/server";
import { createCloseQuoteHandler } from "@/lib/backoffice/closeQuoteHandlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const close = createCloseQuoteHandler({ database: () => database, getSession: readStaffSession });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return close(request, (await context.params).id);
}
