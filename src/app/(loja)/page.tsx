import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HomeDoors, HomeGrafica, HomeOcasioes, HomeParaVoce, HomeRibbon } from "@/components/home/HomeSections";
import { formatProductName } from "@/lib/xbz";
import { HowItWorksTabs } from "@/components/home/HowItWorksTabs";
import { ContactForm } from "@/components/ContactForm";
import { XbzProductCard } from "@/components/XbzCatalog";
import { getCurrentSession } from "@/lib/auth/server";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { toGiftProduct } from "@/lib/giftPricing";
import { buildHomeShowcase, type HomeShowcase } from "@/lib/homeShowcase";
import { groupAvailableProducts } from "@/lib/xbz";
import { getLocalCatalog } from "@/lib/xbzCatalogService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Revelação de Fotos em Jundiaí, Gráfica e Brindes Personalizados | Fare Foto" },
  description: "Revelação e impressão de fotos em 1 hora em Jundiaí, gráfica e impressos sob medida e mais de 4 mil brindes personalizados e corporativos com a sua marca.",
  alternates: { canonical: "/" },
};

async function loadShowcase(): Promise<{ showcase: HomeShowcase; fareCodes?: Map<string, string> }> {
  try {
    const source = await getLocalCatalog();
    return { showcase: buildHomeShowcase(groupAvailableProducts(source.products)), fareCodes: source.fareCodes };
  } catch {
    // Sem catálogo (fornecedor fora do ar na 1ª carga): a Home abre só com os textos.
    return { showcase: { total: 0, categories: [], featured: [], hero: [] } };
  }
}

/** "3.000" para 3.096 produtos: arredonda para baixo, nunca promete mais do que existe. */
function roundedTotal(total: number) {
  const step = total >= 1000 ? 100 : 10;
  return (Math.floor(total / step) * step).toLocaleString("pt-BR");
}

const categoryHref = (name: string) => `/brindes?categoria=${encodeURIComponent(name)}`;

export default async function Home() {
  const [{ showcase, fareCodes }, session] = await Promise.all([loadShowcase(), getCurrentSession()]);
  const pricesVisible = Boolean(session);
  const whatsAppUrl = buildWhatsAppUrl(FARE_FOTO_WHATSAPP, "Olá! Quero um orçamento de brindes personalizados para minha empresa.");

  return (
    <>
      {/* Topo com três portas: fotos, gráfica e brindes. */}
      <HomeDoors
        badge={showcase.total >= 100 ? `${roundedTotal(showcase.total)}+` : null}
        products={showcase.hero.map((product) => ({
          id: product.id,
          name: formatProductName(product.name),
          category: product.category,
          imageUrl: product.imageUrl,
          // A bolinha leva à lista da categoria que aparece embaixo dela, não ao produto.
          href: categoryHref(product.category),
        }))}
        totalLabel={showcase.total >= 100 ? `Mais de ${roundedTotal(showcase.total)} opções` : "Centenas de opções"}
        whatsAppUrl={whatsAppUrl}
      />

      <HomeRibbon />

      <HomeParaVoce />

      <HomeGrafica />

      {showcase.categories.length ? (
        <section className="section-space" id="categorias">
          <div className="container-shell">
            <div className="section-heading split-heading">
              <div>
                <span className="eyebrow">Brindes para sua empresa</span>
                <h2>Encontre o brinde certo.</h2>
              </div>
              <Link className="text-link" href="/brindes">
                Ver todas as categorias <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
            <div className="home-cat-grid">
              {showcase.categories.map((category) => (
                <Link className="home-cat-card" href={categoryHref(category.name)} key={category.name}>
                  <span className="home-cat-photo">
                    <Image alt="" fill sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 200px" src={category.imageUrl} unoptimized />
                  </span>
                  <span className="home-cat-copy">
                    <strong>{category.name}</strong>
                    <small>{category.count} {category.count === 1 ? "produto" : "produtos"}</small>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <HomeOcasioes />

      {showcase.featured.length ? (
        <section className="section-space featured-section">
          <div className="container-shell">
            <div className="section-heading split-heading">
              <div>
                <span className="eyebrow">Brindes em destaque</span>
                <h2>Comece por aqui.</h2>
              </div>
              <Link className="text-link" href="/brindes">
                Ver catálogo completo <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
            <div className="product-grid home-product-grid">
              {showcase.featured.map((product) => (
                <XbzProductCard key={product.id} pricesVisible={pricesVisible} product={toGiftProduct(product, pricesVisible, fareCodes)} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <HowItWorksTabs />

      <ContactForm />
    </>
  );
}
