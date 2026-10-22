import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, Clock, PackageCheck, Upload } from "lucide-react";
import { PhotoGallery } from "@/components/fotos/PhotoGallery";
import { PhotoProductPreview } from "@/components/fotos/PhotoProductPreview";
import { PhotoQualityBand } from "@/components/fotos/PhotoQualityBand";
import { SIZE_GROUPS } from "@/components/fotos/catalog";
import { getProductBySlug } from "@/data/products";
import { FaqSection, type Faq } from "@/lib/seo";

/**
 * Revelação de fotos: primeiro produto próprio a voltar ao site. As demais páginas de produto
 * (src/app/(loja)/produtos/[slug]) continuam levando aos brindes até a próxima etapa.
 */
const product = getProductBySlug("revelacao-de-fotos");

export const metadata: Metadata = {
  title: { absolute: "Revelação de Fotos em Jundiaí — Imprimir e Revelar Fotos em 1 Hora | Fare Foto" },
  description:
    "Revelação de fotos em Jundiaí pronta em 1 hora: imprima fotos do celular em 10x15, 15x21, ampliações e fotos estilo Polaroid e Instax. Papel Fujifilm brilho ou fosco. Envie pelo site.",
  keywords: ["revelação de fotos", "revelação de fotos em Jundiaí", "revelar fotos", "imprimir fotos", "impressão de fotos", "foto 10x15", "ampliação de fotos", "fotos polaroid", "fotos instax"],
  alternates: { canonical: "/produtos/revelacao-de-fotos" },
  openGraph: { title: "Revelação de Fotos em Jundiaí em 1 hora | Fare Foto", description: "Envie as fotos do celular pelo site e retire impressas em 1 hora.", url: "/produtos/revelacao-de-fotos" },
};

const PHOTO_FAQ: Faq[] = [
  { q: "Onde revelar fotos em Jundiaí?", a: "Na Fare Foto, na Rua do Rosário, 68, no Centro de Jundiaí. Você envia as fotos pelo site (ou pelo WhatsApp) e retira na loja ou recebe em casa." },
  { q: "Em quanto tempo a revelação de fotos fica pronta?", a: "Revelação e ampliações até 30 × 45 cm ficam prontas em 1 hora após o pagamento. Grandes formatos ficam prontos em 3 dias úteis." },
  { q: "Quanto custa revelar uma foto 10x15?", a: "Uma foto 10 × 15 sai por R$ 6,00. Quanto mais fotos do mesmo tamanho, menor o preço: R$ 3,50 de 2 a 9 fotos, R$ 3,00 de 10 a 50 fotos, chegando a R$ 1,00 por foto a partir de 1000 fotos." },
  { q: "Como imprimir fotos do celular?", a: "Pelo site: envie as fotos, escolha o tamanho (10 × 15, 13 × 18, 15 × 21, ampliações ou grandes formatos) e o papel brilho ou fosco, ajuste o corte e finalize. As fotos chegam para a gente na qualidade original, sem a compressão do WhatsApp." },
  { q: "Vocês imprimem fotos estilo Polaroid e Instax?", a: "Sim. As fotos retrô saem com a moldura branca nos modelos Polaroid (9 × 11 cm) e Instax (5,5 × 8,5 cm), prontas em 1 hora." },
  { q: "Qual papel vocês usam na revelação?", a: "Revelação química Fujifilm, em papel brilho ou fosco, pelo mesmo preço." },
];

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

      <section className="seo-text">
        <div className="container-shell">
          <h2>Revelação de fotos em Jundiaí, pronta em 1 hora</h2>
          <p>
            Na Fare Foto você revela e imprime fotos sem sair de casa: envie as fotos do celular ou do computador pelo site,
            escolha o tamanho e o papel e retire tudo impresso na loja, no Centro de Jundiaí, em 1 hora após o pagamento.
            Fazemos revelação de fotos 10 × 15, 13 × 18 e 15 × 21, ampliações até 30 × 45 cm, grandes formatos até 60 × 200 cm
            e fotos retrô estilo Polaroid e Instax.
          </p>
          <p>
            Para imprimir fotos de viagem, de família, de festas ou do bebê, a revelação química Fujifilm garante cores fiéis e
            durabilidade. O site avisa se alguma foto puder sair borrada no tamanho escolhido, e a nossa equipe confere cada pedido
            antes de revelar.
          </p>
        </div>
      </section>

      <FaqSection faqs={PHOTO_FAQ} title="Perguntas frequentes sobre revelação de fotos" />

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
