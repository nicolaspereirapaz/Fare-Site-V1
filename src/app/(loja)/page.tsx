import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileCheck2, Heart, MessageCircle, Package, Palette, ShoppingBag } from "lucide-react";
import { HeroSpotlight } from "@/components/HeroSpotlight";
import { publicProductId } from "@/lib/publicCatalog";
import { formatProductName } from "@/lib/xbz";
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
  title: "Fare Foto — brindes personalizados para empresas",
  description: "Canecas, garrafas, mochilas, kits e milhares de brindes personalizados com a sua marca, para equipes, clientes e eventos.",
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
      <HeroSpotlight
        badge={showcase.total >= 100 ? `${roundedTotal(showcase.total)}+` : null}
        products={showcase.hero.map((product) => ({
          id: product.id,
          name: formatProductName(product.name),
          category: product.category,
          imageUrl: product.imageUrl,
          href: `/brindes/${publicProductId(product.internalCode)}`,
        }))}
        totalLabel={showcase.total >= 100 ? `Mais de ${roundedTotal(showcase.total)} opções` : "Opções"}
        whatsAppUrl={whatsAppUrl}
      />

      <section className="service-ribbon" aria-label="Diferenciais do atendimento">
        <div className="container-shell service-ribbon-grid">
          <div><Heart aria-hidden="true" /><span><strong>Feito com cuidado</strong> do arquivo ao acabamento</span></div>
          <div><FileCheck2 aria-hidden="true" /><span><strong>Arte conferida</strong> antes da produção</span></div>
          <div><MessageCircle aria-hidden="true" /><span><strong>Atendimento humano</strong> para fechar os detalhes</span></div>
        </div>
      </section>

      {showcase.categories.length ? (
        <section className="section-space" id="categorias">
          <div className="container-shell">
            <div className="section-heading split-heading">
              <div>
                <span className="eyebrow">Explore por categoria</span>
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

      <section className="section-space process-section" id="como-funciona">
        <div className="container-shell">
          <div className="section-heading centered-heading">
            <span className="eyebrow">Simples e acompanhado</span>
            <h2>Do catálogo à entrega.</h2>
            <p>Você escolhe os brindes; a equipe confere arte, valores e prazo com você antes de produzir.</p>
          </div>
          <ol className="process-grid">
            <li>
              <span>01</span>
              <ShoppingBag aria-hidden="true" />
              <h3>Escolha os brindes</h3>
              <p>Navegue pelo catálogo, compare cores e quantidades. Com seu cadastro, os preços aparecem na hora.</p>
            </li>
            <li>
              <span>02</span>
              <Package aria-hidden="true" />
              <h3>Faça o pedido ou peça um orçamento</h3>
              <p>Monte o carrinho com tudo o que precisa e envie. Seus dados de faturamento já vão junto.</p>
            </li>
            <li>
              <span>03</span>
              <Palette aria-hidden="true" />
              <h3>A equipe confirma com você</h3>
              <p>Pelo WhatsApp, combinamos a arte com o seu logo, o valor final, o prazo e a entrega.</p>
            </li>
          </ol>
        </div>
      </section>

      <ContactForm />
    </>
  );
}
