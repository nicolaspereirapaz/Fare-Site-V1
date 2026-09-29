import { OUTUBRO_ROSA_PRODUCT_CODES } from "@/data/outubroRosaProducts";
import { selectCampaignProducts } from "@/lib/campaignProducts";
import { campaignPriceTiers, campaignQuantityPricing, campaignStartingPrice } from "@/lib/campaignPricing";
import { publicProductId, toPublicCatalogProduct, type PublicCatalogProduct } from "@/lib/publicCatalog";
import { withCampaignFeaturedColor } from "@/lib/campaignColors";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import { groupAvailableProducts, type CatalogProduct } from "@/lib/xbz";

export const dynamic = "force-dynamic";

function toCampaignProduct(product: CatalogProduct): PublicCatalogProduct {
  // A página abre na mesma cor do card: rosa, ou branco quando não houver rosa.
  return { ...withCampaignFeaturedColor(toPublicCatalogProduct(product)), startingPrice: campaignStartingPrice(product) };
}

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    const source = await getLocalCatalog();
    // Só produtos da seleção da campanha: o código público de outro brinde não abre aqui.
    const selected = selectCampaignProducts(groupAvailableProducts(source.products), OUTUBRO_ROSA_PRODUCT_CODES);
    const product = selected.find((item) => publicProductId(item.internalCode) === code);

    if (!product) {
      return Response.json({ error: "Produto não encontrado ou sem estoque." }, { status: 404 });
    }

    const related = selected
      .filter((item) => item.category === product.category && item.internalCode !== product.internalCode)
      .slice(0, 3)
      .map(toCampaignProduct);

    return Response.json(
      {
        product: toCampaignProduct(product),
        priceTiers: campaignPriceTiers(product),
        quantityPricing: campaignQuantityPricing(product),
        related,
        meta: { fetchedAt: source.fetchedAt, cached: source.cached },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar o catálogo.";
    return Response.json({ error: message }, { status: 502 });
  }
}
