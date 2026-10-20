import type { MetadataRoute } from "next";
import { publicProductId } from "@/lib/publicCatalog";
import { siteUrl } from "@/lib/siteUrl";
import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

export const dynamic = "force-dynamic";

const PAGES = ["/", "/produtos/revelacao-de-fotos", "/grafica", "/brindes", "/campanhas/outubro-rosa", "/privacidade"];

/** Páginas da loja + cada brinde à venda (o catálogo muda: lista montada na hora). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages: MetadataRoute.Sitemap = PAGES.map((path) => ({ url: `${base}${path === "/" ? "" : path}` }));
  try {
    const { products } = await getLocalCatalog();
    return [...pages, ...groupAvailableProducts(products).map((product) => ({ url: `${base}/brindes/${publicProductId(product.internalCode)}` }))];
  } catch {
    return pages; // catálogo fora do ar: pelo menos as páginas fixas
  }
}
