import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock, PackageCheck, Upload } from "lucide-react";
import { PhotoGallery } from "@/components/fotos/PhotoGallery";
import { PhotoProductPreview } from "@/components/fotos/PhotoProductPreview";
import { PhotoQualityBand } from "@/components/fotos/PhotoQualityBand";
import { SIZE_GROUPS } from "@/components/fotos/catalog";
import { getProductBySlug } from "@/data/products";

/**
 * Revelação de fotos: primeiro produto próprio a voltar ao site. As demais páginas de produto
 * (src/app/(loja)/produtos/[slug]) continuam levando aos brindes até a próxima etapa.
 */
const product = getProductBySlug("revelacao-de-fotos");

export const metadata: Metadata = {
  title: product?.name,
  description: product?.shortDescription,
};

export default async function RevelacaoPage({ searchParams }: { searchParams: Promise<{ tipo?: string | string[] }> }) {
  if (!product) notFound();
  // ?tipo=retro (menu "Fotos"): abre na aba e na foto desse tipo. A `key` refaz a página ao trocar de tipo pelo menu.
  const tipo = (await searchParams).tipo;
  const group = SIZE_GROUPS.find((item) => item.id === tipo)?.id ?? "revelacao";

  return (
    <>
      <section className="product-detail-section">
        <div className="container-shell">
          <nav className="breadcrumb" aria-label="Caminho de navegação">
            <Link href="/"><ArrowLeft aria-hidden="true" size={16} /> Início</Link>
            <span>/</span><span>{product.category}</span><span>/</span><strong>{product.name}</strong>
          </nav>

          <div className="product-detail-grid">
            <div className="product-media-column">
              <PhotoGallery badge={product.badge} group={group} key={`galeria-${group}`} />
              <div className="product-highlights">
                {product.highlights.map((highlight) => (
                  <span key={highlight}><Check aria-hidden="true" size={17} />{highlight}</span>
                ))}
              </div>
            </div>
            <PhotoProductPreview group={group} key={`fotos-${group}`} name={product.name} shortDescription={product.shortDescription} />
          </div>
        </div>
      </section>

      <PhotoQualityBand />

      <section className="product-information">
        <div className="container-shell product-information-grid">
          <div>
            <span className="eyebrow">Como funciona</span>
            <h2>Do seu celular para o papel, sem complicação.</h2>
            <p>Envie as fotos pelo site, escolha tamanho e papel, ajuste o corte e finalize pelo WhatsApp. As fotos chegam para a gente na qualidade original, sem a compressão do WhatsApp.</p>
            <p>O site avisa se alguma foto puder sair borrada no tamanho escolhido. Fotos de celular atuais ficam ótimas até 15 × 21 cm.</p>
          </div>
          <ol className="product-steps">
            <li><Upload aria-hidden="true" /><span><strong>1. Envie e ajuste</strong>Tamanho, papel, corte, borda e filtros no próprio site.</span></li>
            <li><PackageCheck aria-hidden="true" /><span><strong>2. A equipe confere</strong>Olhamos as fotos e o pedido antes de imprimir.</span></li>
            <li><Clock aria-hidden="true" /><span><strong>3. Retire ou receba</strong>Até 30 × 45 cm fica pronto em 1 hora após o pagamento. Grandes formatos, em 3 dias úteis.</span></li>
          </ol>
        </div>
      </section>
    </>
  );
}
