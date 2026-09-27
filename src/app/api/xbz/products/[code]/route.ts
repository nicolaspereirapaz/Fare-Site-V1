import { getProducts, groupAvailableProducts } from "@/lib/xbz";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/xbz/products/[code]">) {
  try {
    const { code } = await context.params;
    const source = await getProducts();
    const product = groupAvailableProducts(source.products).find((item) => item.internalCode === code);

    if (!product) {
      return Response.json({ error: "Produto não encontrado ou sem estoque." }, { status: 404 });
    }

    return Response.json({
      product,
      meta: { fetchedAt: source.fetchedAt, cached: source.cached },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a XBZ.";
    return Response.json({ error: message }, { status: 502 });
  }
}
