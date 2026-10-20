import { quoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderServer";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Editar pedido: GET abre no editor; PUT salva itens, desconto e observação interna. */
export async function GET(request: Request, context: Context) {
  return quoteBuilderHandlers.readOrder(request, (await context.params).id);
}

export async function PUT(request: Request, context: Context) {
  return quoteBuilderHandlers.updateOrder(request, (await context.params).id);
}
