import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";
import { type PublicProductsResponse } from "@/lib/publicCatalog";
import { getCurrentSession } from "@/lib/auth/server";
import { MEMBER_PRICING_HEADERS, toGiftProduct } from "@/lib/giftPricing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase("pt-BR");
  const category = (params.get("categoria") ?? "").trim();
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24));

  try {
    // Cópia local do catálogo (atualizada algumas vezes por dia pelo agendador): rápida e
    // independente da disponibilidade do fornecedor. O ?refresh=1 antigo foi removido para que
    // nenhum visitante consiga forçar consultas à cota diária da XBZ.
    const [source, session] = await Promise.all([getLocalCatalog(), getCurrentSession()]);
    const pricesVisible = Boolean(session);
    const grouped = groupAvailableProducts(source.products);

    const filtered = grouped.filter((product) => {
      if (category && product.category !== category) return false;
      if (!query) return true;
      const haystack = [
        product.name,
        product.description,
        product.internalCode,
        product.category,
        product.subcategory,
        ...product.colors,
        ...product.variants.flatMap((variant) => [variant.sku, variant.compoundCode]),
      ].join(" ").toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    });

    const categories = Array.from(
      grouped.reduce((counts, product) => {
        counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
      ([name, count]) => ({ name, count }),
    ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    const start = (page - 1) * limit;
    const response: PublicProductsResponse & { categories: typeof categories; pricesVisible: boolean } = {
      products: filtered.slice(start, start + limit).map((product) => toGiftProduct(product, pricesVisible)),
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
