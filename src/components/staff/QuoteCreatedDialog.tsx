"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Download, ExternalLink, FileText, LayoutGrid } from "lucide-react";

/**
 * Logo depois de salvar (criar ou editar orçamento, criar pedido): prévia do HTML que vai ao cliente,
 * com Baixar HTML. Fechar leva ao quadro, onde o cartão aparece em destaque.
 */
export function QuoteCreatedDialog({ quoteId, code, onClose, kind = "quote", verb = "criado" }: {
  /** Id do orçamento ou do pedido. */
  quoteId: string; code: string; onClose: () => void; kind?: "quote" | "order"; verb?: "criado" | "salvo";
}) {
  const base = kind === "order" ? `/api/backoffice/orders/${quoteId}/documento` : `/api/backoffice/quotes/${quoteId}/proposta`;
  const label = kind === "order" ? "Pedido" : "Orçamento";
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
            {label} {code} {verb}
          </h2>
        </header>
        <div className="qe-done-body">
          <iframe title={`Prévia ${kind === "order" ? "do pedido" : "da proposta"} ${code}`} src={`${base}?ver=1`} sandbox="allow-scripts" style={{ width: "100%", height: "100%", border: 0, background: "white", display: "block" }} />
        </div>
        <footer className="qe-modal-foot qe-done-foot">
          <a className="qe-btn qe-btn-secondary" href={`${base}?ver=1`} rel="noopener noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={15} /> Abrir em outra aba
          </a>
          <a className="qe-btn qe-btn-secondary" href={base}>
            <Download aria-hidden="true" size={15} /> Baixar HTML
          </a>
          <Link className="qe-btn qe-btn-secondary" href={kind === "order" ? `/equipe/pedidos/${quoteId}` : `/equipe/orcamentos/${quoteId}/consulta`}>
            <FileText aria-hidden="true" size={15} /> Abrir {kind === "order" ? "pedido" : "orçamento"}
          </Link>
          <button className="qe-btn qe-btn-primary" onClick={onClose} ref={closeRef} type="button">
            <LayoutGrid aria-hidden="true" size={15} /> Ir para o quadro
          </button>
        </footer>
      </div>
    </div>
  );
}
