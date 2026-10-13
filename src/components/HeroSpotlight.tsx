"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, MessageCircle } from "lucide-react";

export type SpotlightProduct = { id: string; name: string; category: string; imageUrl: string; href: string };

/** Tempo de cada produto no holofote (a barrinha da miniatura acompanha). */
export const SPOTLIGHT_INTERVAL_MS = 3600;

const RING_TEXT = "Sua marca • seus brindes • Fare Foto • Sua marca • seus brindes • Fare Foto •";

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Banner da Home (opção C "Holofote"): um brinde por vez num círculo de luz, com anel de texto girando,
 * miniaturas clicáveis com barra de tempo e troca automática. Fotos e números vêm do catálogo real.
 */
export function HeroSpotlight({
  products,
  totalLabel,
  badge,
  whatsAppUrl,
}: {
  products: SpotlightProduct[];
  totalLabel: string;
  badge: string | null;
  whatsAppUrl: string;
}) {
  // `cycle` muda a cada troca para reiniciar a barrinha e o temporizador (inclusive ao clicar no mesmo).
  const [{ index, cycle }, setSpot] = useState({ index: 0, cycle: 0 });
  const current = products[index] ?? null;

  useEffect(() => {
    if (products.length < 2 || prefersReducedMotion()) return;
    const timer = window.setTimeout(
      () => setSpot((spot) => ({ index: (spot.index + 1) % products.length, cycle: spot.cycle + 1 })),
      SPOTLIGHT_INTERVAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [cycle, products.length]);

  const show = (next: number) => setSpot((spot) => ({ index: next, cycle: spot.cycle + 1 }));

  return (
    <section aria-label="Destaques Fare Foto" className="hs-hero">
      <div className="container-shell hs-inner">
        <div className="hs-copy">
          <span className="hs-eyebrow hs-fade">Brindes personalizados para empresas</span>
          <h1 className="hs-fade" style={{ animationDelay: "0.12s" }}>
            Sua marca em brindes que <em>circulam.</em>
          </h1>
          <p className="hs-fade" style={{ animationDelay: "0.26s" }}>
            {totalLabel} para equipes, clientes e eventos. Você escolhe, a gente confere a arte e cuida da produção.
          </p>
          <div className="hs-ctas hs-fade" style={{ animationDelay: "0.4s" }}>
            <Link className="hs-btn hs-btn-primary" href="/brindes">
              Ver brindes <ArrowRight aria-hidden="true" className="hs-arrow" size={18} />
            </Link>
            <a className="hs-btn hs-btn-glass" href={whatsAppUrl} rel="noopener noreferrer" target="_blank">
              <MessageCircle aria-hidden="true" size={18} /> Falar com a equipe
            </a>
          </div>
          {products.length > 1 ? (
            <div aria-label="Escolher o brinde em destaque" className="hs-thumbs hs-fade" role="group" style={{ animationDelay: "0.55s" }}>
              {products.map((product, position) => (
                <button
                  aria-label={product.name}
                  aria-pressed={position === index}
                  className={position === index ? "hs-thumb on" : "hs-thumb"}
                  key={product.id}
                  onClick={() => show(position)}
                  type="button"
                >
                  <span className="hs-thumb-photo">
                    <Image alt="" fill sizes="64px" src={product.imageUrl} unoptimized />
                  </span>
                  <span aria-hidden="true" className="hs-thumb-bar">
                    {position === index ? <span key={cycle} /> : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {current ? (
          <div className="hs-stage">
            <svg aria-hidden="true" className="hs-ring" viewBox="0 0 560 560">
              <defs>
                <path d="M280,280 m-250,0 a250,250 0 1,1 500,0 a250,250 0 1,1 -500,0" id="hs-ring-path" />
              </defs>
              <text>
                <textPath href="#hs-ring-path">{RING_TEXT}</textPath>
              </text>
            </svg>
            <Link aria-label={`Ver ${current.name}`} className="hs-disc" href={current.href}>
              {products.map((product, position) => (
                <span aria-hidden="true" className={position === index ? "hs-disc-photo in" : "hs-disc-photo out"} key={product.id}>
                  <Image alt="" fill priority={position === 0} sizes="(max-width: 960px) 60vw, 300px" src={product.imageUrl} unoptimized />
                </span>
              ))}
            </Link>
            <span aria-live="polite" className="hs-label" role="status">
              <i aria-hidden="true" />
              {current.category}
            </span>
            {badge ? (
              <span className="hs-badge">
                <span>
                  <b>{badge}</b>
                  <small>brindes</small>
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
