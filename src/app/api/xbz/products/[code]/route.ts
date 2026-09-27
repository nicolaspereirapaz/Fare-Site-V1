import { getProducts, groupAvailableProducts } from "@/lib/xbz";
import { publicProductId, toPublicCatalogProduct } from "@/lib/publicCatalog";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/xbz/products/[code]">) {
  try {
    const { code } = await context.params;
    const source = await getProducts();
    const product = groupAvailableProducts(source.products).find(
      (item) => publicProductId(item.internalCode) === code,
    );

    if (!product) {
      return Response.json({ error: "Produto não encontrado ou sem estoque." }, { status: 404 });
    }

    return Response.json({
      product: toPublicCatalogProduct(product),
      meta: { fetchedAt: source.fetchedAt, cached: source.cached },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a XBZ.";
    return Response.json({ error: message }, { status: 502 });
  }
}
