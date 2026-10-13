import { proposalHandlers } from "@/lib/proposals/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET: PDF da proposta (?ver = abre no navegador). POST: marca como enviada e devolve a mensagem do WhatsApp. */
export async function GET(request: Request, context: Context) {
  return proposalHandlers.pdf(request, (await context.params).id);
}

export async function POST(request: Request, context: Context) {
  return proposalHandlers.send(request, (await context.params).id);
}
