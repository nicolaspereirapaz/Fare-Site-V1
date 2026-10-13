import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import { publicProductId } from "@/lib/publicCatalog";
import { getCurrentSession } from "@/lib/auth/server";
import { MEMBER_PRICING_HEADERS, giftPricingDetail, toGiftProduct } from "@/lib/giftPricing";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/xbz/products/[code]">) {
  try {
    const { code } = await context.params;
    const [source, session] = await Promise.all([getLocalCatalog(), getCurrentSession()]);
    const pricesVisible = Boolean(session);
    const product = groupAvailableProducts(source.products).find(
      (item) => publicProductId(item.internalCode) === code,
    );

    if (!product) {
      return Response.json({ error: "Produto não encontrado ou sem estoque." }, { status: 404 });
    }

    return Response.json({
      product: toGiftProduct(product, pricesVisible, source.fareCodes),
      ...giftPricingDetail(product, pricesVisible),
      meta: { fetchedAt: source.fetchedAt, cached: source.cached },
    }, { headers: MEMBER_PRICING_HEADERS });
  } catch (error) {
    console.error("[brindes] falha ao ler o catálogo local", error);
    return Response.json({ error: "Catálogo temporariamente indisponível." }, { status: 503 });
  }
}
