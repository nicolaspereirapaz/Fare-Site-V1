import { orderDocumentHandlers } from "@/lib/proposals/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ code: string }> };
/** code é o ID interno, como nas demais rotas do pedido. */
export async function GET(request: Request, context: Context) {
 return orderDocumentHandlers.pdf(request, (await context.params).code);
}
/** Apenas prepara texto/wa.me; a equipe anexa o HTML manualmente. */
export async function POST(request: Request, context: Context) {
 return orderDocumentHandlers.send(request, (await context.params).code);
}
