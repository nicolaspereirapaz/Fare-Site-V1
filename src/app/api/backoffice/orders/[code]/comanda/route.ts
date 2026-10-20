import { database } from "@/lib/auth";
import { documentImageOf } from "@/lib/proposals/catalogImages";
import { createComandaHandler } from "@/lib/proposals/comanda";
import { readStaffSession } from "@/lib/staff/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const comanda = createComandaHandler({ getSession: readStaffSession as never, database: () => database, imageOf: documentImageOf });

/** code é o ID interno, como nas demais rotas do pedido. */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  return comanda(request, (await context.params).code);
}
