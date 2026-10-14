"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Download, ExternalLink, LayoutGrid } from "lucide-react";

/**
 * Logo depois de "Criar orçamento": prévia do PDF da proposta (o mesmo que vai ao cliente),
 * com Baixar PDF. Fechar leva ao quadro, onde o cartão novo aparece em destaque em "Em negociação".
 */
export function QuoteCreatedDialog({ quoteId, code, onClose }: { quoteId: string; code: string; onClose: () => void }) {
  const base = `/api/backoffice/quotes/${quoteId}/proposta`;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="qe-scrim" role="presentation">
      <div aria-labelledby="qe-done-title" aria-modal="true" className="qe-modal qe-done" role="dialog">
        <header className="qe-modal-head">
          <h2 id="qe-done-title">
            <CheckCircle2 aria-hidden="true" className="qe-done-ok" size={20} />
            Orçamento {code} criado
          </h2>
        </header>
        <div className="qe-done-body">
          <iframe className="qe-done-pdf" src={`${base}?ver=1`} title={`Prévia da proposta ${code}`} />
        </div>
        <footer className="qe-modal-foot qe-done-foot">
          <a className="qe-btn qe-btn-secondary" href={`${base}?ver=1`} rel="noopener noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={15} /> Abrir em outra aba
          </a>
          <a className="qe-btn qe-btn-secondary" href={base}>
            <Download aria-hidden="true" size={15} /> Baixar PDF
          </a>
          <button className="qe-btn qe-btn-primary" onClick={onClose} ref={closeRef} type="button">
            <LayoutGrid aria-hidden="true" size={15} /> Ir para o quadro
          </button>
        </footer>
      </div>
    </div>
  );
}
