"use client";

import { useState } from "react";
import { Download, FileText, MessageCircle } from "lucide-react";

const formatDateTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
}).format(new Date(iso));

/** Número do cliente a partir do link wa.me que o servidor monta (null = cliente sem WhatsApp). */
export function phoneFromWhatsAppUrl(url: string | null | undefined): string | null {
  const digits = url ? /wa\.me\/(\d{10,15})/.exec(url)?.[1] : undefined;
  return digits ?? null;
}

/**
 * Proposta do orçamento: ver/baixar o HTML e enviar pelo WhatsApp.
 * "Enviar" passa o orçamento para "Em negociação" e abre a conversa no Atendimento
 * com o HTML já anexado e "Segue proposta" escrito; o vendedor confere e envia.
 */
export function ProposalActions({ quoteId, orderId, sentAt = null, blocked, onSent }: { quoteId?: string; orderId?: string; sentAt?: string | null; blocked: string | null; onSent: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const base = orderId ? `/api/backoffice/orders/${orderId}/documento` : `/api/backoffice/quotes/${quoteId}/proposta`;

  async function send() {
    // Abre a aba já no clique (senão o navegador bloqueia o pop-up depois do await).
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(base, { method: "POST" });
      const payload = (await response.json()) as { whatsappUrl?: string | null; text?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Não foi possível gerar a proposta.");
      const phone = phoneFromWhatsAppUrl(payload.whatsappUrl);
      if (phone && tab) {
        const texto = orderId ? "Segue o pedido" : "Segue proposta";
        tab.location.href = `/equipe/atendimento?${new URLSearchParams({ telefone: phone, anexo: base, texto })}`;
      } else {
        tab?.close();
        if (payload.text) {
          if (!navigator.clipboard) throw new Error("Não foi possível copiar. Cadastre o WhatsApp do cliente ou habilite a área de transferência.");
          await navigator.clipboard.writeText(payload.text);
          setCopied(true);
        }
      }
      await onSent();
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
        <h3>{orderId ? "Documento do pedido" : "Proposta"}</h3>
        <span>{orderId ? "HTML e envio ao cliente" : sentAt ? `Enviada em ${formatDateTime(sentAt)}` : "Ainda não enviada"}</span>
      </div>
      {blocked ? (
        <p className="kb-dialog-warning">{blocked}</p>
      ) : (
        <div className="kb-proposal-actions">
          <a className="kb-secondary" href={`${base}?ver=1`} rel="noopener noreferrer" target="_blank"><FileText aria-hidden="true" size={15} /> Ver HTML</a>
          <a className="kb-secondary" href={base}><Download aria-hidden="true" size={15} /> Baixar HTML</a>
          <button className="kb-proposal-send" disabled={busy} onClick={send} type="button">
            <MessageCircle aria-hidden="true" size={15} /> {busy ? "Gerando…" : sentAt ? "Reenviar no WhatsApp" : "Enviar no WhatsApp"}
          </button>
        </div>
      )}
      {!blocked ? <p className="kb-proposal-hint">Abre a conversa no Atendimento com o HTML anexado e a mensagem pronta.</p> : null}
      {copied ? <p className="kb-proposal-hint">Cliente sem WhatsApp cadastrado: a mensagem foi copiada.</p> : null}
      {error ? <p className="kb-dialog-warning" role="alert">{error}</p> : null}
    </section>
  );
}
