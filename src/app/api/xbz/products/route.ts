import { getProducts, groupAvailableProducts, type ProductsResponse } from "@/lib/xbz";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase("pt-BR");
  const category = (params.get("categoria") ?? "").trim();
  const forceRefresh = params.get("refresh") === "1";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(params.get("limit") ?? "24", 10) || 24));

  try {
    const source = await getProducts(forceRefresh);
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
    const response: ProductsResponse & { categories: typeof categories } = {
      products: filtered.slice(start, start + limit),
      categories,
      meta: {
        total: filtered.length,
        page,
        limit,
        fetchedAt: source.fetchedAt,
        cached: source.cached,
      },
    };

    return Response.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao consultar a XBZ.";
    return Response.json({ error: message }, { status: 502 });
  }
}
