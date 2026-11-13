import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { getImageProps } from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SegmentShowcase } from "@/components/SegmentShowcase";
import { BRINDES_VITRINE, findSegment } from "@/data/brindesSegmentos";
import { buildWhatsAppUrl } from "@/lib/commerce";
import { FARE_FOTO_WHATSAPP } from "@/lib/constants";
import { FaqSection } from "@/lib/seo";
import styles from "./segmento.module.css";

export const dynamic = "force-dynamic";

type SegmentPageProps = { params: Promise<{ segmento: string }> };

/** "**palavra**" vira destaque. */
const highlight = (text: string) => text.split(/\*\*(.+?)\*\*/).map((part, index) => (index % 2 ? <em key={index}>{part}</em> : part));
const plain = (text: string) => text.replaceAll("**", "");

export async function generateMetadata({ params }: SegmentPageProps): Promise<Metadata> {
  const segment = findSegment((await params).segmento);
  if (!segment) return {};
  const path = `/brindes/segmentos/${segment.slug}`;
  return {
    title: { absolute: segment.metaTitle },
    description: segment.description,
    keywords: segment.keywords,
    alternates: { canonical: path },
    // A página é enviada pelo WhatsApp: a arte do banner vira a prévia do link.
    openGraph: { title: `${plain(segment.title)} | Fare Foto`, description: segment.slogan, url: path, images: [segment.banner.pc] },
  };
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .2-1.2c-.1-.1-.3-.2-.5-.3Z" />
    </svg>
  );
}

export default async function SegmentPage({ params }: SegmentPageProps) {
  const segment = findSegment((await params).segmento);
  if (!segment) notFound();

  const whatsApp = buildWhatsAppUrl(FARE_FOTO_WHATSAPP, segment.whatsApp);
  const [titleStart, titleHighlight] = segment.title.split(/\*\*(.+?)\*\*/);
  // Arte diferente no computador (3:1) e no celular (2:3); o navegador baixa só a da tela.
  const {
    props: { srcSet: pcSrcSet },
  } = getImageProps({ alt: "", src: segment.banner.pc, width: 2400, height: 800, sizes: "min(100vw, 1360px)" });
  const {
    props: { srcSet: mobileSrcSet, ...bannerImage },
  } = getImageProps({ alt: segment.banner.alt, src: segment.banner.mobile, width: 1024, height: 1536, sizes: "min(100vw, 600px)" });
  const cards = BRINDES_VITRINE.map((card) => ({ title: card.title, imageUrl: card.image, href: `/brindes?categoria=${encodeURIComponent(card.category)}` }));

  return (
    <>
      <header className={styles.hero} style={{ "--segment-color": segment.color } as CSSProperties}>
        <picture>
          <source media="(min-width: 900px)" sizes="min(100vw, 1360px)" srcSet={pcSrcSet} />
          <img {...bannerImage} alt={segment.banner.alt} className={styles.heroImage} fetchPriority="high" srcSet={mobileSrcSet} />
        </picture>
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>Campanha de fim de ano</span>
          <h1>
            {titleStart.trim()}
            <br />
            <em>{titleHighlight}</em>
          </h1>
          <p>{segment.slogan}</p>
          <div className={styles.heroCtas}>
            <a className={`${styles.btn} ${styles.btnWa}`} href={whatsApp} rel="noreferrer" target="_blank">
              <WhatsAppIcon />
              Falar com um vendedor
            </a>
            <Link className={`${styles.btn} ${styles.btnGhost}`} href="/brindes">Ver mais brindes</Link>
          </div>
        </div>
      </header>

      <section className={styles.showcase}>
        <span className={styles.eyebrow}>{segment.showcaseEyebrow}</span>
        <h2>{highlight(segment.showcaseTitle)}</h2>
        <p className={styles.lead}>{segment.showcaseLead}</p>
        <SegmentShowcase cards={cards} />
        <div className={styles.ctas}>
          <a className={`${styles.btn} ${styles.btnWa}`} href={whatsApp} rel="noreferrer" target="_blank">
            <WhatsAppIcon />
            Falar com um vendedor
          </a>
          <Link className={`${styles.btn} ${styles.btnMore}`} href="/brindes">Ver mais brindes</Link>
        </div>
        <div className={styles.trust}>
          <span>Arte conferida pela nossa equipe</span>
          <span>Entrega em Jundiaí e região</span>
          <span>Atendimento próximo</span>
        </div>
      </section>

      <FaqSection faqs={segment.faq} title={`Perguntas frequentes sobre brindes para ${segment.name}`} />
    </>
  );
}
