"use client";

// o "holofote" do banner antigo, em tamanho de porta: um item por vez em destaque, trocando sozinho.
// Brindes: círculo de luz com anel de texto girando. Impressos: quadrado de cantos arredondados, com cartões atrás.
// A troca acontece sempre (inclusive com "reduzir animações" ligado — aí só esmaece, sem giro nem desfoque)
// e pausa enquanto o mouse ou o foco está em cima.
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export type DoorProduct = { id: string; name: string; category: string; imageUrl: string; href: string };

const INTERVAL_MS = 3200;

export function DoorSpotlight({
  products = [],
  badge = null,
  shape = "circle",
  ringText,
  remote = true,
}: {
  products?: DoorProduct[];
  badge?: string | null;
  shape?: "circle" | "square";
  ringText?: string;
  /** Fotos de fora (CDN do fornecedor) vão sem o otimizador do Next. */
  remote?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = products[index] ?? null;

  // Todos os holofotes da página seguem o mesmo relógio: trocam juntos, no mesmo instante.
  useEffect(() => {
    if (products.length < 2 || paused) return;
    let timer = 0;
    const tick = () => {
      const now = Date.now();
      setIndex(Math.floor(now / INTERVAL_MS) % products.length);
      timer = window.setTimeout(tick, INTERVAL_MS - (now % INTERVAL_MS) + 20);
    };
    timer = window.setTimeout(tick, INTERVAL_MS - (Date.now() % INTERVAL_MS) + 20);
    return () => window.clearTimeout(timer);
  }, [products.length, paused]);

  if (!current) return null;

  return (
    <div
      className={`ds-stage ds-${shape}`}
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {ringText ? (
        <svg aria-hidden="true" className="ds-ring" viewBox="0 0 560 560">
          <defs>
            <path d="M280,280 m-250,0 a250,250 0 1,1 500,0 a250,250 0 1,1 -500,0" id={`ds-ring-${shape}`} />
          </defs>
          <text><textPath href={`#ds-ring-${shape}`}>{ringText}</textPath></text>
        </svg>
      ) : null}
      {shape === "square" ? (
        <>
          <span aria-hidden="true" className="ds-deck ds-deck-1" key={`a-${index}`} />
          <span aria-hidden="true" className="ds-deck ds-deck-2" key={`b-${index}`} />
        </>
      ) : null}
      <Link aria-label={`Ver ${current.category}`} className="ds-disc" href={current.href}>
        {products.map((product, position) => (
          <span aria-hidden="true" className={position === index ? "ds-photo in" : "ds-photo out"} key={product.id}>
            <Image alt="" fill sizes="240px" src={product.imageUrl} unoptimized={remote} />
          </span>
        ))}
      </Link>
      <span aria-live="polite" className="ds-label" role="status"><i aria-hidden="true" />{current.category}</span>
      {badge ? <span className="ds-badge"><b>{badge}</b><small>brindes</small></span> : null}
    </div>
  );
}
