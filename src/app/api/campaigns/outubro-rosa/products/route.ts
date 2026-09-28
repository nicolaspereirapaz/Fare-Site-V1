import { OUTUBRO_ROSA_PRODUCT_CODES } from "@/data/outubroRosaProducts";
import { selectCampaignProducts } from "@/lib/campaignProducts";
import { toPublicCatalogProduct, type PublicProductsResponse } from "@/lib/publicCatalog";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import { groupAvailableProducts } from "@/lib/xbz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24));

  try {
    const source = await getLocalCatalog();
    const available = groupAvailableProducts(source.products);
    const selected = selectCampaignProducts(available, OUTUBRO_ROSA_PRODUCT_CODES);
    const start = (page - 1) * limit;

    const response: PublicProductsResponse = {
      products: selected.slice(start, start + limit).map(toPublicCatalogProduct),
      meta: {
        total: selected.length,
        page,
        limit,
        fetchedAt: source.fetchedAt,
        cached: source.cached,
      },
    };

    return Response.json(response, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar o catálogo.";
    return Response.json({ error: message }, { status: 502 });
  }
}
