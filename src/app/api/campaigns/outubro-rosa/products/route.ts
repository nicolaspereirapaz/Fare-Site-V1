import { OUTUBRO_ROSA_PRODUCT_CODES } from "@/data/outubroRosaProducts";
import { selectCampaignProducts } from "@/lib/campaignProducts";
import { campaignStartingPrice } from "@/lib/campaignPricing";
import { withCampaignFeaturedColor } from "@/lib/campaignColors";
import { toPublicCatalogProduct, type PublicProductsResponse } from "@/lib/publicCatalog";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import { groupAvailableProducts, type CatalogProduct } from "@/lib/xbz";

export const dynamic = "force-dynamic";

/** Mínimo de produtos para uma categoria aparecer no filtro da campanha. */
const MIN_CATEGORY_SIZE = 3;

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

// Busca só em campos públicos: códigos internos do fornecedor não são pesquisáveis.
function matchesSearch(product: CatalogProduct, query: string) {
  if (!query) return true;
  const haystack = normalizeSearch([
    product.name, product.description, product.category, product.subcategory, ...product.colors,
  ].join(" "));
  return query.split(/\s+/).every((term) => haystack.includes(term));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24));
  const query = normalizeSearch((params.get("q") ?? "").trim());
  const category = (params.get("categoria") ?? "").trim();

  try {
    const source = await getLocalCatalog();
    const available = groupAvailableProducts(source.products);
    const selected = selectCampaignProducts(available, OUTUBRO_ROSA_PRODUCT_CODES);

    // Contagem por categoria sobre a seleção inteira, como na aba Brindes.
    // Categorias com poucos itens ficam fora do filtro (os produtos continuam em "Todos").
    const categories = Array.from(
      selected.reduce((counts, product) => counts.set(product.category, (counts.get(product.category) ?? 0) + 1), new Map<string, number>()),
      ([name, count]) => ({ name, count }),
    )
      .filter((item) => item.count >= MIN_CATEGORY_SIZE)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const filtered = selected.filter((product) =>
      (!category || product.category === category) && matchesSearch(product, query));
    const start = (page - 1) * limit;

    const response: PublicProductsResponse = {
      // Vitrine na cor da campanha: rosa, ou branco quando não houver rosa.
      products: filtered.slice(start, start + limit).map((product) => ({
        ...withCampaignFeaturedColor(toPublicCatalogProduct(product)),
        startingPrice: campaignStartingPrice(product),
      })),
      categories,
      catalogTotal: selected.length,
      meta: {
        total: filtered.length,
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
