"use client";

import { useState } from "react";
import { Download, FileText, MessageCircle } from "lucide-react";

const formatDateTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
}).format(new Date(iso));

/**
 * Proposta do orçamento: ver/baixar o PDF e enviar pelo WhatsApp.
 * "Enviar" abre a conversa com a mensagem pronta e passa o orçamento para "Em negociação";
 * o PDF é anexado pelo vendedor na conversa (o WhatsApp não aceita anexo por link).
 */
export function ProposalActions({ quoteId, sentAt, blocked, onSent }: { quoteId: string; sentAt: string | null; blocked: string | null; onSent: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = `/api/backoffice/quotes/${quoteId}/proposta`;

  async function send() {
    // Abre a aba já no clique (senão o navegador bloqueia o pop-up depois do await).
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(base, { method: "POST" });
      const payload = (await response.json()) as { whatsappUrl?: string | null; text?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível gerar a proposta.");
      if (payload.whatsappUrl && tab) {
        tab.location.href = payload.whatsappUrl;
      } else {
        tab?.close();
        if (payload.text) {
          await navigator.clipboard?.writeText(payload.text).catch(() => undefined);
          setCopied(true);
        }
      }
      onSent();
    } catch (caught) {
      tab?.close();
      setError(caught instanceof Error ? caught.message : "Erro inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="kb-proposal">
      <div className="kb-proposal-head">
        <h3>Proposta</h3>
        <span>{sentAt ? `Enviada em ${formatDateTime(sentAt)}` : "Ainda não enviada"}</span>
      </div>
      {blocked ? (
        <p className="kb-dialog-warning">{blocked}</p>
      ) : (
        <div className="kb-proposal-actions">
          <a className="kb-secondary" href={`${base}?ver=1`} rel="noopener noreferrer" target="_blank"><FileText aria-hidden="true" size={15} /> Ver PDF</a>
          <a className="kb-secondary" href={base}><Download aria-hidden="true" size={15} /> Baixar PDF</a>
          <button className="kb-proposal-send" disabled={busy} onClick={send} type="button">
            <MessageCircle aria-hidden="true" size={15} /> {busy ? "Gerando…" : sentAt ? "Reenviar no WhatsApp" : "Enviar no WhatsApp"}
          </button>
        </div>
      )}
      {!blocked ? <p className="kb-proposal-hint">A conversa abre com a mensagem pronta. Baixe o PDF e anexe na conversa.</p> : null}
      {copied ? <p className="kb-proposal-hint">Cliente sem WhatsApp cadastrado: a mensagem foi copiada.</p> : null}
      {error ? <p className="kb-dialog-warning" role="alert">{error}</p> : null}
    </section>
  );
}
