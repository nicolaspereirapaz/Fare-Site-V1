import { quoteBuilderHandlers } from "@/lib/backoffice/quoteBuilderServer";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return quoteBuilderHandlers.read(request, (await context.params).id);
}

export async function PUT(request: Request, context: Context) {
  return quoteBuilderHandlers.update(request, (await context.params).id);
}
