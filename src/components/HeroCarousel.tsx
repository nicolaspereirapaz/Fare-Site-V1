"use client";

import Image from "next/image";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const slides = [
  {
    title: "Suas histórias merecem sair da tela.",
    body: "Revelações, fotoálbuns, quadros e porta-retratos produzidos com atenção a cada detalhe.",
    image: "/images/hero-farefoto.webp",
    imageAlt: "Cliente Fare Foto com copo personalizado e embalagem laranja",
    href: "/produtos?categoria=Fotografias%2C%20%C3%A1lbuns%20e%20molduras",
    cta: "Ver produtos",
    tone: "cream",
  },
  {
    title: "Sua marca em itens que circulam.",
    body: "Canecas, copos e peças personalizadas para equipes, clientes e eventos.",
    image: "/images/canecas-personalizadas.webp",
    imageAlt: "Canecas personalizadas com fotografias",
    href: "/produtos?categoria=Brindes%20para%20sua%20empresa",
    cta: "Ver brindes",
    tone: "navy",
  },
  {
    title: "Sua comunicação impressa com presença.",
    body: "Cartões, folders, tags e adesivos produzidos para apresentar seu negócio com consistência.",
    image: "/images/cartao-visita.webp",
    imageAlt: "Cartões de visita minimalistas impressos",
    href: "/produtos?categoria=Gr%C3%A1fica",
    cta: "Ver linha gráfica",
    tone: "orange",
  },
];

export function HeroCarousel() {
  const [viewportRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi || !playing || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => emblaApi.scrollNext(), 6500);
    return () => window.clearInterval(timer);
  }, [emblaApi, playing]);

  return (
    <section aria-label="Destaques Fare Foto" className="hero-carousel">
      <div className="hero-viewport" ref={viewportRef}>
        <div className="hero-track">
          {slides.map((slide) => (
            <article className={`hero-slide hero-${slide.tone}`} key={slide.title}>
              <div className="container-shell hero-slide-inner">
                <div className="hero-copy">
                  <h1>{slide.title}</h1>
                  <p>{slide.body}</p>
                  <div className="hero-actions">
                    <Link className="button button-primary button-large" href={slide.href}>
                      {slide.cta} <ArrowRight aria-hidden="true" size={19} />
                    </Link>
                    <Link className="button button-ghost button-large" href="/#contato">
                      Falar com a equipe
                    </Link>
                  </div>
                </div>
                <div className="hero-image-wrap">
                  <Image
                    alt={slide.imageAlt}
                    fill
                    priority={slide === slides[0]}
                    sizes="(max-width: 800px) 100vw, 48vw"
                    src={slide.image}
                  />
                  <span className="hero-image-note">Feito pela Fare Foto</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="container-shell hero-controls">
        <div className="hero-dots" aria-label="Selecionar destaque">
          {slides.map((slide, index) => (
            <button
              aria-label={`Ir para o destaque ${index + 1}`}
              aria-pressed={selectedIndex === index}
              key={slide.title}
              onClick={() => emblaApi?.scrollTo(index)}
              type="button"
            />
          ))}
        </div>
        <div className="hero-control-buttons">
          <button aria-label="Destaque anterior" onClick={() => emblaApi?.scrollPrev()} type="button">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            aria-label={playing ? "Pausar rotação" : "Retomar rotação"}
            onClick={() => setPlaying((current) => !current)}
            type="button"
          >
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          </button>
          <button aria-label="Próximo destaque" onClick={() => emblaApi?.scrollNext()} type="button">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
