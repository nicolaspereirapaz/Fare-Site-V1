import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import { type PublicProductsResponse } from "@/lib/publicCatalog";
import { filterCatalog, parseCatalogParams, queryCatalog, unitPriceFor } from "@/lib/catalogQuery";
import { getCurrentSession } from "@/lib/auth/server";
import { fareCodeOf, MEMBER_PRICING_HEADERS, toGiftProduct } from "@/lib/giftPricing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24));

  try {
    // Cópia local do catálogo (atualizada algumas vezes por dia pelo agendador): rápida e
    // independente da disponibilidade do fornecedor. Nenhum visitante força consulta ao fornecedor.
    const [source, session] = await Promise.all([getLocalCatalog(), getCurrentSession()]);
    const pricesVisible = Boolean(session);
    const grouped = groupAvailableProducts(source.products);
    const query = parseCatalogParams(params, pricesVisible);
    // Busca por campos públicos + código Fare Foto (só cadastrados veem o código, mas buscar por ele é inofensivo).
    // Os códigos do fornecedor não entram, para ninguém descobrir a origem do produto pela busca.
    const codeOf = (product: (typeof grouped)[number]) => fareCodeOf(product, source.fareCodes) ?? "";

    const filtered = queryCatalog(grouped, query, codeOf);
    // Contagem por categoria respeita busca, quantidade e preço (só a categoria fica livre).
    const categories = Array.from(
      filterCatalog(grouped, { ...query, category: "" }, codeOf).reduce((counts, product) => {
        counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
      ([name, count]) => ({ name, count }),
    ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const start = (page - 1) * limit;
    const response: PublicProductsResponse & { categories: typeof categories; pricesVisible: boolean } = {
      products: filtered.slice(start, start + limit).map((product) => {
        const gift = toGiftProduct(product, pricesVisible, source.fareCodes);
        // Com quantidade escolhida, o card mostra o preço por unidade para essa quantidade.
        if (!pricesVisible || query.quantity === null) return gift;
        return { ...gift, startingPrice: unitPriceFor(product, query.quantity), priceQuantity: query.quantity };
      }),
      categories,
      pricesVisible,
      meta: {
        total: filtered.length,
        page,
        limit,
        fetchedAt: source.fetchedAt,
        cached: source.cached,
      },
    };

    return Response.json(response, { headers: MEMBER_PRICING_HEADERS });
  } catch (error) {
    console.error("[brindes] falha ao ler o catálogo local", error);
    return Response.json({ error: "Catálogo temporariamente indisponível." }, { status: 503 });
  }
}
