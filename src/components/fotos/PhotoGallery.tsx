"use client";

// galeria da página da revelação, com as fotos de produto.
// Usa o mesmo trilho de miniaturas dos brindes; no celular dá para deslizar a foto grande com o dedo.
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SizeGroup } from "@/components/fotos/catalog";
import "./galeria.css";

// Etiquetas de tamanho: x/y em % da imagem, no meio da borda de cima de cada foto do exemplo.
type Tag = { label: string; x: number; y: number };
// `group`: a galeria abre na primeira foto do tipo escolhido no menu "Fotos".
const PHOTOS: { src: string; alt: string; tags: Tag[]; group?: SizeGroup }[] = [
  { src: "/images/revelacao/01-pilha-fotos-10x15.webp", alt: "Pilha de fotos 10x15 reveladas, com duas fotos soltas ao lado", tags: [{ label: "10 × 15 cm", x: 48, y: 12 }], group: "revelacao" },
  { src: "/images/revelacao/02-mao-segurando-fotos.webp", alt: "Mão segurando várias fotos 10x15 abertas em leque", tags: [{ label: "10 × 15 cm", x: 76, y: 21 }] },
  {
    group: "retro",
    src: "/images/revelacao/06-fotos-retro.webp",
    alt: "Mãos segurando, lado a lado, uma foto 10x15, uma foto retrô Polaroid 9x11 e uma Instax 5,5x8,5 com a foto de um casal",
    tags: [
      { label: "10 × 15", x: 23.8, y: 18.9 },
      { label: "Polaroid 9 × 11", x: 57.8, y: 33.5 },
      { label: "Instax 5,5 × 8,5", x: 84.5, y: 42.2 },
    ],
  },
  {
    src: "/images/revelacao/03-escala-tamanhos.webp",
    alt: "Fotos lado a lado do menor ao maior tamanho: 10x15, 15x21, 20x30 e 30x45",
    tags: [
      { label: "10 × 15", x: 12, y: 58 },
      { label: "15 × 21", x: 28.6, y: 50 },
      { label: "20 × 30", x: 49.6, y: 40 },
      { label: "30 × 45 cm", x: 77, y: 23 },
    ],
  },
  { src: "/images/revelacao/04-ampliacao-30x45-parede.webp", alt: "Ampliação 30x45 na parede, com uma família sentada no campo ao pôr do sol", tags: [{ label: "30 × 45 cm", x: 50, y: 24.6 }], group: "ampliacao" },
  {
    group: "grande",
    src: "/images/revelacao/05-grande-formato-60x90.webp",
    alt: "Foto em grande formato 60x90 encostada na parede, ao lado de uma 20x30 e de uma 10x15",
    tags: [
      { label: "60 × 90 cm", x: 33.6, y: 12.4 },
      { label: "20 × 30", x: 71, y: 57 },
      { label: "10 × 15", x: 88.2, y: 70.4 },
    ],
  },
];

/** Aba de "Tamanhos e preços" escolhida (detail = SizeGroup): a galeria vai para a foto desse tipo. */
export const PHOTO_TYPE_EVENT = "fotos-tipo";
const firstOf = (group?: SizeGroup) => PHOTOS.findIndex((item) => item.group === group);

export function PhotoGallery({ badge, group }: { badge?: string; group?: SizeGroup }) {
  const [index, setIndex] = useState(() => Math.max(0, firstOf(group)));
  useEffect(() => {
    const onType = (event: Event) => {
      const found = firstOf((event as CustomEvent<SizeGroup>).detail);
      if (found >= 0) setIndex(found);
    };
    window.addEventListener(PHOTO_TYPE_EVENT, onType);
    return () => window.removeEventListener(PHOTO_TYPE_EVENT, onType);
  }, []);
  const touchX = useRef<number | null>(null);
  const go = (step: number) => setIndex((current) => (current + step + PHOTOS.length) % PHOTOS.length);
  const photo = PHOTOS[index];

  return (
    <div className="product-gallery photo-gallery">
      <div aria-label="Fotos do produto" className="product-thumbnail-rail">
        {PHOTOS.map((item, i) => (
          <button
            aria-label={`Ver foto ${i + 1} de ${PHOTOS.length}`}
            aria-pressed={i === index}
            className={`product-thumbnail product-thumbnail-button${i === index ? " active" : ""}`}
            key={item.src}
            onClick={() => setIndex(i)}
            type="button"
          >
            <Image alt="" fill sizes="72px" src={item.src} />
          </button>
        ))}
      </div>
      <div
        className="product-main-image"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") go(-1);
          if (event.key === "ArrowRight") go(1);
        }}
        onTouchEnd={(event) => {
          if (touchX.current === null) return;
          const delta = event.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
        }}
        onTouchStart={(event) => { touchX.current = event.touches[0].clientX; }}
      >
        {/* unoptimized: mostra o webp original de 2000px, sem a recompressão do Next (que deixava as fotos borradas) */}
        <Image alt={photo.alt} fill key={photo.src} priority={index === 0} sizes="(max-width: 900px) 100vw, 48vw" src={photo.src} unoptimized />
        {photo.tags.map((tag) => (
          <span aria-hidden="true" className="pg-tag" key={`${photo.src}-${tag.label}`} style={{ left: `${tag.x}%`, top: `${tag.y}%` }}>{tag.label}</span>
        ))}
        {/* selo só na primeira foto, para não brigar com as etiquetas de tamanho */}
        {badge && index === 0 ? <span className="product-badge">{badge}</span> : null}
        <button aria-label="Foto anterior" className="pg-arrow pg-prev" onClick={() => go(-1)} type="button"><ChevronLeft aria-hidden="true" size={22} /></button>
        <button aria-label="Próxima foto" className="pg-arrow pg-next" onClick={() => go(1)} type="button"><ChevronRight aria-hidden="true" size={22} /></button>
        <span aria-hidden="true" className="pg-dots">
          {PHOTOS.map((item, i) => <i className={i === index ? "active" : ""} key={item.src} />)}
        </span>
      </div>
    </div>
  );
}
