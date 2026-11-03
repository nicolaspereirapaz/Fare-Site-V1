"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { mediaUrl } from "@/components/staff/atendimento/media";
import type { Message } from "@/lib/atendimento/types";

/** Visualizador de fotos da conversa: setas (ou ← →) passam, Esc fecha, botão baixa a original. */
export function PhotoViewer({ photos, index, onIndex, onClose }: { photos: Message[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const photo = photos[index];
  const go = (step: number) => onIndex((index + step + photos.length) % photos.length);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex((index + 1) % photos.length);
      if (event.key === "ArrowLeft") onIndex((index - 1 + photos.length) % photos.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, onClose, onIndex, photos.length]);

  if (!photo) return null;
  return (
    <div aria-label="Fotos da conversa" aria-modal="true" className="at-viewer" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="dialog">
      <header className="at-viewer-bar">
        <span>
          {index + 1} de {photos.length}
          {photo.body ? ` · ${photo.body}` : ""}
          <small> · {photo.author === "cliente" ? "cliente" : photo.authorName} · {new Date(photo.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
        </span>
        <a className="at-viewer-btn" href={mediaUrl(photo.id, { download: true })} title="Baixar original">
          <Download aria-hidden="true" size={18} />
        </a>
        <button aria-label="Fechar" className="at-viewer-btn" onClick={onClose} ref={closeRef} type="button">
          <X aria-hidden="true" size={20} />
        </button>
      </header>
      {photos.length > 1 ? (
        <button aria-label="Foto anterior" className="at-viewer-nav is-prev" onClick={() => go(-1)} type="button">
          <ChevronLeft aria-hidden="true" size={28} />
        </button>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element -- foto privada servida pela API */}
      <img alt={photo.media?.name || "Foto"} className="at-viewer-img" key={photo.id} src={mediaUrl(photo.id)} />
      {photos.length > 1 ? (
        <button aria-label="Próxima foto" className="at-viewer-nav is-next" onClick={() => go(1)} type="button">
          <ChevronRight aria-hidden="true" size={28} />
        </button>
      ) : null}
    </div>
  );
}
