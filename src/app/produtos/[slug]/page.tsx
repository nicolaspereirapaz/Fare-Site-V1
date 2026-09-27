import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, FileText, MessageCircle, PackageCheck } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { getProductBySlug, products } from "@/data/products";

type ProductPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};
  return { title: product.name, description: product.shortDescription };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const related = products
    .filter((item) => item.category === product.category && item.slug !== product.slug)
    .slice(0, 3);

  return (
    <>
      <section className="product-detail-section">
        <div className="container-shell">
          <nav className="breadcrumb" aria-label="Caminho de navegação">
            <Link href="/produtos"><ArrowLeft aria-hidden="true" size={16} /> Produtos</Link>
            <span>/</span><span>{product.category}</span><span>/</span><strong>{product.name}</strong>
          </nav>

          <div className="product-detail-grid">
            <div className="product-media-column">
              <div className="product-gallery">
                <div className="product-thumbnail" aria-hidden="true">
                  <Image alt="" fill sizes="72px" src={product.image} />
                </div>
                <div className="product-main-image">
                  <Image alt={product.imageAlt} fill priority sizes="(max-width: 900px) 100vw, 48vw" src={product.image} />
                  {product.badge ? <span className="product-badge">{product.badge}</span> : null}
                </div>
              </div>
              <div className="product-highlights">
                {product.highlights.map((highlight) => (
                  <span key={highlight}><Check aria-hidden="true" size={17} />{highlight}</span>
                ))}
              </div>
            </div>
            <ProductConfigurator product={product} />
          </div>
        </div>
      </section>

      <section className="product-information">
        <div className="container-shell product-information-grid">
          <div>
            <span className="eyebrow">Sobre o produto</span>
            <h2>Configure com liberdade. Confirme com segurança.</h2>
            <p>{product.description}</p>
            <p>{product.artworkGuidance}</p>
          </div>
          <ol className="product-steps">
            <li><FileText aria-hidden="true" /><span><strong>1. Monte o pedido</strong>Selecione as opções disponíveis e a quantidade.</span></li>
            <li><PackageCheck aria-hidden="true" /><span><strong>2. A equipe confere</strong>Validamos arquivo, disponibilidade, valor e prazo.</span></li>
            <li><MessageCircle aria-hidden="true" /><span><strong>3. Aprove no WhatsApp</strong>Você só confirma depois de revisar todos os detalhes.</span></li>
          </ol>
        </div>
      </section>

      {related.length ? (
        <section className="section-space related-section">
          <div className="container-shell">
            <div className="section-heading"><span className="eyebrow">Você também pode gostar</span><h2>Mais em {product.category}</h2></div>
            <div className="product-grid related-grid">{related.map((item) => <ProductCard key={item.slug} product={item} />)}</div>
          </div>
        </section>
      ) : null}
    </>
  );
}
