"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Lock, Pencil, Send } from "lucide-react";
import { brl, minimumIssues, photoPayload, setPhotos, summarize, type Photo } from "@/components/fotos/shared";
import { applyDiscount } from "@/lib/quotes/discount";
import type { PhotoLinkView } from "@/lib/photoLinks/links";

export type PhotoLinkProps = {
  token: string; view: PhotoLinkView; done: boolean; onDone: () => void;
  /** As fotos do envio anterior foram recolocadas no editor ("Alterar fotos"). */
  reopened: boolean;
  /** Abre o envio anterior no editor; devolve quantas fotos não deu para abrir e se os ajustes voltaram. */
  reopen: () => Promise<{ missing: number; restoredEdits: boolean }>;
  /** Equipe ("Editar fotos"): abre direto no editor. */
  autoEdit: boolean;
};

/**
 * Tela do link fora do editor: "Fotos recebidas" (com "Alterar fotos" enquanto o pedido não entrou em produção)
 * ou o aviso de que não dá mais para mudar.
 */
export function LinkStatus({ link }: { link: PhotoLinkProps }) {
  const { view } = link;
  const canEdit = view.editable && (link.done || Boolean(view.previous));
  const [busy, setBusy] = useState(() => link.autoEdit && canEdit);
  const [error, setError] = useState<string | null>(null);
  const received = link.done || Boolean(view.submittedAt);

  const { reopen, autoEdit } = link;
  useEffect(() => {
    if (!autoEdit || !canEdit) return;
    let active = true;
    reopen().catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Não foi possível abrir as fotos."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
    // Só ao abrir a página (um clique em "Editar fotos" = uma reabertura).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function edit() {
    setBusy(true);
    setError(null);
    link.reopen().catch((caught) => setError(caught instanceof Error ? caught.message : "Não foi possível abrir as fotos.")).finally(() => setBusy(false));
  }

  if (!view.editable) {
    return (
      <section className="fp fp-page"><div className="container-shell">
        <div className="fp-link-done">
          <Lock aria-hidden="true" size={40} />
          <h1 className="fp-h1">{received ? "As fotos não podem mais ser alteradas" : "Este link não aceita mais alterações"}</h1>
          <p>{view.kindLabel === "pedido"
            ? `O pedido ${view.code} já entrou em produção ou foi encerrado. Para mudar algo, fale com a loja pelo WhatsApp.`
            : `O orçamento ${view.code} já foi fechado ou encerrado. Para mudar algo, fale com a loja pelo WhatsApp.`}</p>
        </div>
      </div></section>
    );
  }

  return (
    <section className="fp fp-page"><div className="container-shell">
      <div className="fp-link-done">
        <CheckCircle2 aria-hidden="true" size={40} />
        <h1 className="fp-h1">Fotos recebidas!</h1>
        <p>As fotos do {view.kindLabel} {view.code} chegaram para a Fare Foto{view.previous && !link.done ? ` (${view.previous.photos} ${view.previous.photos === 1 ? "foto" : "fotos"}, ${view.previous.copies} ${view.previous.copies === 1 ? "cópia" : "cópias"})` : ""}. Vamos conferir e falar com você pelo WhatsApp.</p>
        {canEdit ? (
          <>
            <p className="fp-help">Quer trocar alguma foto, o tamanho, o papel ou as quantidades? Dá para alterar até o {view.kindLabel} entrar em produção. O novo envio substitui o anterior.</p>
            <button className="button button-primary" disabled={busy} onClick={edit} type="button">
              <Pencil aria-hidden="true" size={17} /> {busy ? "Abrindo as fotos enviadas…" : "Alterar fotos"}
            </button>
          </>
        ) : null}
        {error ? <p className="fp-help fp-link-error" role="alert">{error}</p> : null}
      </div>
    </div></section>
  );
}

/**
 * Resumo do link das fotos: brindes do orçamento (fixos) + fotos do cliente (preço especial da equipe ou tabela),
 * desconto e total, atualizados a cada mudança. "Enviar para a loja" manda as fotos e atualiza o orçamento/pedido.
 */
export function LinkSummary({ link, photos, summary }: { link: PhotoLinkProps; photos: Photo[]; summary: ReturnType<typeof summarize> }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { view } = link;
  const photoLines = summary.sizes.map((group) => {
    const special = view.special[group.size.id];
    const unit = special ?? group.price.unit;
    return { id: group.size.id, label: group.size.label, copies: group.copies, unit, total: Math.round(unit * group.copies * 100) / 100, special: special !== undefined };
  });
  const othersTotal = view.others.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);
  const subtotalCents = Math.round((othersTotal + photoLines.reduce((sum, line) => sum + line.total, 0)) * 100);
  const priced = applyDiscount(subtotalCents, view.discount && subtotalCents ? view.discount : null);
  const onRequest = view.others.some((item) => item.unitPrice === null);
  const uploading = photos.filter((photo) => photo.upload?.status === "enviando").length;
  const failed = photos.some((photo) => photo.upload?.status === "erro");
  const belowMinimum = minimumIssues(photos);

  // Já enviou antes: o envio novo troca o anterior.
  const resend = Boolean(view.submittedAt) || link.reopened;

  async function send() {
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/fotos/link/${link.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photos: photos.filter((photo) => photo.copies > 0).map(photoPayload) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar. Tente de novo.");
      setPhotos([]);
      link.onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="fp-summary fp-summary-sticky fp-link-summary">
      <h2>{view.kindLabel === "pedido" ? "Seu pedido" : "Seu orçamento"} <span>{view.code}</span></h2>
      {view.others.map((item) => (
        <div className="fp-summary-row fp-link-line" key={item.id}>
          <span>
            {item.name}
            {item.details ? <small>{item.details}</small> : null}
            <small>{item.quantity.toLocaleString("pt-BR")} × {item.unitPrice === null ? "sob consulta" : brl(item.unitPrice)}</small>
          </span>
          <strong>{item.unitPrice === null ? "—" : brl(item.unitPrice * item.quantity)}</strong>
        </div>
      ))}
      {photoLines.map((line) => (
        <div className="fp-summary-row fp-link-line" key={line.id}>
          <span>Fotos {line.label}<small>{line.copies} × {brl(line.unit)}{line.special ? " · preço combinado" : ""}</small></span>
          <strong>{brl(line.total)}</strong>
        </div>
      ))}
      {!photoLines.length ? <p className="fp-help">Nenhuma foto ainda.</p> : null}
      {priced.discountCents ? <div className="fp-summary-row"><span>Desconto</span><strong>− {brl(priced.discountCents / 100)}</strong></div> : null}
      {priced.freightCents ? <div className="fp-summary-row"><span>Frete</span><strong>{brl(priced.freightCents / 100)}</strong></div> : null}
      <div className="fp-summary-total"><span>Total</span><strong>{onRequest ? "a combinar" : brl(priced.totalCents / 100)}</strong></div>
      {belowMinimum.map((text) => <p className="fp-help fp-link-error" key={text} role="status">{text}</p>)}
      <button className="button button-primary button-large" disabled={sending || !photos.length || uploading > 0 || failed || belowMinimum.length > 0} onClick={send} type="button">
        <Send aria-hidden="true" size={18} /> {sending ? "Enviando…" : uploading ? `Enviando fotos (faltam ${uploading})…` : resend ? "Enviar alterações" : "Enviar para a loja"}
      </button>
      {resend ? <p className="fp-help">Substitui as fotos enviadas antes por estas.</p> : null}
      {failed ? <p className="fp-help fp-link-error">Alguma foto não subiu. Toque em “Tentar de novo” nela ou remova.</p> : null}
      {error ? <p className="fp-help fp-link-error" role="alert">{error}</p> : null}
      <p className="fp-help">O valor final é confirmado pela loja.</p>
    </aside>
  );
}
