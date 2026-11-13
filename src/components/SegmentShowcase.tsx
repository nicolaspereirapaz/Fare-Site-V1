"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/app/(loja)/brindes/segmentos/[segmento]/segmento.module.css";

export type ShowcaseCard = { title: string; href: string; imageUrl: string };

/** Vitrine da página de segmento: duas faixas de brindes passando devagar, em sentidos opostos. */
export function SegmentShowcase({ cards }: { cards: ShowcaseCard[] }) {
  const half = Math.ceil(cards.length / 2);
  return (
    <div className={styles.marquee}>
      <Row cards={cards.slice(0, half)} />
      <Row cards={cards.slice(half)} reverse />
    </div>
  );
}

/** Quantas cópias da faixa são precisas para cada metade cobrir a largura visível (o loop anda -50% sem emenda). */
export const copiesToFill = (visibleWidth: number, setWidth: number) => Math.max(2, 2 * Math.ceil(visibleWidth / setWidth));

function Row({ cards, reverse = false }: { cards: ShowcaseCard[]; reverse?: boolean }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    const row = rowRef.current;
    const inner = row?.firstElementChild as HTMLElement | null;
    if (!row || !inner) return;
    const fit = () => {
      const setWidth = inner.scrollWidth / copies;
      if (!setWidth) return;
      const needed = copiesToFill(row.clientWidth, setWidth);
      if (needed !== copies) return setCopies(needed);
      // Mesma velocidade em qualquer tela: px por segundo, não tempo fixo por volta.
      const speed = row.clientWidth >= 900 ? 34 : 30;
      inner.style.animationDuration = `${(setWidth * copies) / 2 / speed}s`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [copies]);

  return (
    <div className={`${styles.row}${reverse ? ` ${styles.reverse}` : ""}`} ref={rowRef}>
      <div className={styles.rowIn}>
        {Array.from({ length: copies }, (_, copy) =>
          cards.map((card) => (
            // As cópias só completam a animação: ficam fora do leitor de tela e do Tab.
            <Link aria-hidden={copy > 0 || undefined} className={styles.tile} href={card.href} key={`${copy}-${card.title}`} tabIndex={copy > 0 ? -1 : undefined}>
              <span className={styles.photo}>
                <Image alt="" height={800} sizes="(min-width: 900px) 340px, 228px" src={card.imageUrl} width={800} />
              </span>
              <span className={styles.caption}>{card.title}</span>
            </Link>
          )),
        )}
      </div>
    </div>
  );
}
