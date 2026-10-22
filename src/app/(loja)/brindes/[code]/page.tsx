import type { Metadata } from "next";
import { XbzProductDetail } from "@/components/XbzProductDetail";
import { publicProductId } from "@/lib/publicCatalog";
import { formatProductName, groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

type BrindePageProps = { params: Promise<{ code: string }> };

/** Título e descrição com o nome do produto (cada brinde vira uma página própria no Google). */
export async function generateMetadata({ params }: BrindePageProps): Promise<Metadata> {
  const code = decodeURIComponent((await params).code);
  const fallback: Metadata = { title: "Brinde personalizado", description: "Brinde personalizado com a sua marca na Fare Foto, em Jundiaí." };
  try {
    const { products } = await getLocalCatalog();
    const product = groupAvailableProducts(products).find((item) => publicProductId(item.internalCode) === code);
    if (!product) return fallback;
    const name = formatProductName(product.name);
    const about = product.description.replace(/\s+/g, " ").trim();
    const description = `${name} personalizado com a logo da sua empresa. ${about}`.slice(0, 155).replace(/\s+\S*$/, "") + "…";
    return {
      title: `${name} personalizado com a sua marca`,
      description,
      alternates: { canonical: `/brindes/${code}` },
      openGraph: { title: `${name} personalizado | Fare Foto`, description, url: `/brindes/${code}`, images: product.imageUrl ? [product.imageUrl] : undefined },
    };
  } catch {
    return fallback;
  }
}

export default async function BrindePage({ params }: BrindePageProps) {
  const { code } = await params;

  return (
    <section className="product-detail-section">
      <div className="container-shell">
        <XbzProductDetail code={decodeURIComponent(code)} />
      </div>
    </section>
  );
}
