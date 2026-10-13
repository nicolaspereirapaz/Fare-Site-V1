import { database } from "@/lib/auth";
import { createProposalHandlers } from "@/lib/proposals/handlers";
import { renderProposalPdf } from "@/lib/proposals/pdf";
import { publicProductId, toPublicCatalogProduct } from "@/lib/publicCatalog";
import { staffAuth } from "@/lib/staff/auth";
import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

/** Endereço público do site usado nos links do PDF (produção: https://www.farefoto.com.br). */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.farefoto.com.br";

export const proposalHandlers = createProposalHandlers({
  getSession: staffAuth.api.getSession as never,
  database: () => database,
  siteUrl: SITE_URL,
  imageOf: async (item) => {
    if (!item.slug.startsWith("brindes/")) return null;
    const { products } = await getLocalCatalog();
    const product = groupAvailableProducts(products).find((entry) => publicProductId(entry.internalCode) === item.slug.slice("brindes/".length));
    if (!product) return null;
    const variants = toPublicCatalogProduct(product).variants;
    return variants.find((variant) => variant.label === item.selections?.["Variação"])?.imageUrl ?? product.imageUrl ?? null;
  },
  render: renderProposalPdf,
});
