"use client";

import { Download, FileText, Images, Mic, Printer, Video, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatBytes, mediaUrl } from "@/components/staff/atendimento/media";
import { PhotoOrderForm } from "@/components/staff/atendimento/PhotoOrderForm";
import { api, displayName, type Conversation, type LinkedCustomer } from "@/components/staff/atendimento/shared";
import { formatNumberList, parseNumberList } from "@/lib/atendimento/numberList";
import type { MessageMedia } from "@/lib/atendimento/types";

type MediaItem = {
  number: number;
  id: string;
  author: "cliente" | "ia" | "vendedor" | "sistema";
  authorName: string;
  caption: string;
  createdAt: string;
  media: MessageMedia;
};

type Kind = "todas" | "fotos";

/**
 * Mídias do contato, numeradas (nº 1 = a mais antiga). Para baixar em lote:
 * clique nas fotos (Shift+clique marca a faixa) ou digite como na impressora ("1-5, 8") e baixe o ZIP.
 */
export function MediaDialog({ conversation, customers, onClose }: { conversation: Conversation; customers: LinkedCustomer[] | null; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("todas");
  const [onlyCustomer, setOnlyCustomer] = useState(false);
  const [numbersText, setNumbersText] = useState("");
  const [anchor, setAnchor] = useState<number | null>(null);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    api<{ media: MediaItem[] }>(`/api/atendimento/conversas/${conversation.id}/midias`)
      .then((data) => active && setItems(data.media))
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : "Erro ao carregar as mídias."));
    return () => {
      active = false;
    };
  }, [conversation.id]);

  const visible = useMemo(
    () => (items ?? []).filter((item) => (kind === "todas" || item.media.mime.startsWith("image/")) && (!onlyCustomer || item.author === "cliente")),
    [items, kind, onlyCustomer],
  );
  const total = items?.length ?? 0;
  const chosen = useMemo(() => parseNumberList(numbersText, total), [numbersText, total]);
  const typed = numbersText.trim() !== "";
  // Nada escolhido = todas (as do filtro).
  const selected = typed ? visible.filter((item) => chosen.has(item.number)) : visible;
  const selectedPhotos = selected.filter((item) => item.media.mime.startsWith("image/"));

  /** Clique marca/desmarca uma; Shift+clique marca da última clicada até esta (como no Windows). */
  function pick(number: number, range: boolean) {
    const next = new Set(chosen);
    if (range && anchor !== null) {
      for (let n = Math.min(anchor, number); n <= Math.max(anchor, number); n += 1) next.add(n);
    } else if (next.has(number)) {
      next.delete(number);
    } else {
      next.add(number);
    }
    setAnchor(number);
    setNumbersText(formatNumberList(next));
  }

  const zipUrl = () => {
    const params = new URLSearchParams();
    if (typed) params.set("nums", formatNumberList(chosen));
    if (kind === "fotos") params.set("tipo", "fotos");
    if (onlyCustomer) params.set("quem", "cliente");
    return `/api/atendimento/conversas/${conversation.id}/midias/zip?${params}`;
  };

  return (
    <div className="kb-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby={titleId} aria-modal="true" className="kb-dialog at-media-dialog" role="dialog">
        <header className="kb-dialog-head">
          <div>
            <h2 id={titleId}>
              <Images aria-hidden="true" size={18} /> Mídias de {displayName(conversation)}
            </h2>
            <p className="at-muted">
              Clique nas fotos para escolher (<strong>Shift+clique</strong> marca a faixa) ou digite os números como na impressora: <strong>1-5, 8, 10-12</strong>. Sem nada escolhido, vale todas. Os arquivos saem na qualidade em que chegaram.
            </p>
          </div>
          <button aria-label="Fechar" className="kb-dialog-close" onClick={onClose} ref={closeRef} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div className="at-media-toolbar">
          <div className="at-seg" role="group" aria-label="Tipo">
            <button aria-pressed={kind === "todas"} className={kind === "todas" ? "is-active" : undefined} onClick={() => setKind("todas")} type="button">
              Todas
            </button>
            <button aria-pressed={kind === "fotos"} className={kind === "fotos" ? "is-active" : undefined} onClick={() => setKind("fotos")} type="button">
              Só fotos
            </button>
          </div>
          <label className="at-check">
            <input checked={onlyCustomer} onChange={(event) => setOnlyCustomer(event.target.checked)} type="checkbox" /> Só as que o cliente mandou
          </label>
          <span className="at-media-range">
            <label>
              Números
              <input
                aria-describedby={`${titleId}-nums`}
                onChange={(event) => setNumbersText(event.target.value.replace(/[^\d\s,;\-–aAtTéeÉE]/g, ""))}
                placeholder={total ? `ex.: 1-${Math.min(total, 5)}, ${Math.min(total, 8)}` : "ex.: 1-5, 8"}
                value={numbersText}
              />
            </label>
            <span className="at-muted" id={`${titleId}-nums`}>
              {typed ? (chosen.size ? `${selected.length} escolhida${selected.length === 1 ? "" : "s"}` : "nenhum número válido") : `de 1 a ${total}`}
            </span>
            {typed ? (
              <button className="at-btn at-btn-quiet" onClick={() => { setNumbersText(""); setAnchor(null); }} type="button">
                Limpar
              </button>
            ) : null}
          </span>
          <span className="at-media-actions at-order-actions">
            <button className="at-btn" disabled={!selectedPhotos.length || ordering} onClick={() => setOrdering(true)} title="Pedido de revelação com as fotos selecionadas" type="button">
              <Printer aria-hidden="true" size={16} /> Criar pedido de fotos ({selectedPhotos.length})
            </button>
            <a aria-disabled={!selected.length} className={`at-btn at-btn-primary${selected.length ? "" : " is-disabled"}`} download href={selected.length ? zipUrl() : undefined}>
              <Download aria-hidden="true" size={16} /> {typed ? "Baixar escolhidas" : "Baixar todas"} · {selected.length} {selected.length === 1 ? "arquivo" : "arquivos"}
            </a>
          </span>
        </div>

        {ordering ? (
          <PhotoOrderForm conversation={conversation} customers={customers} messageIds={selectedPhotos.map((item) => item.id)} onCancel={() => setOrdering(false)} />
        ) : null}
        {error ? <div className="at-banner at-banner-error" role="alert">{error}</div> : null}
        {!items && !error ? <p className="at-muted at-center at-media-status">Carregando…</p> : null}
        {items && !visible.length ? <p className="at-muted at-center at-media-status">Nenhuma mídia {items.length ? "com esse filtro" : "nesta conversa"}.</p> : null}

        <ul className="at-media-grid">
          {visible.map((item) => {
            const inRange = typed && chosen.has(item.number);
            const Icon = item.media.mime.startsWith("video/") ? Video : item.media.mime.startsWith("audio/") ? Mic : FileText;
            return (
              <li className={inRange ? "is-selected" : undefined} key={item.id}>
                <button
                  aria-label={`Mídia nº ${item.number}: ${item.media.name}. Clique para escolher; Shift+clique escolhe a faixa.`}
                  aria-pressed={inRange}
                  className="at-media-tile"
                  onClick={(event) => pick(item.number, event.shiftKey)}
                  title={`${item.media.name} · ${formatBytes(item.media.size)} · ${new Date(item.createdAt).toLocaleString("pt-BR")}`}
                  type="button"
                >
                  {item.media.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura privada servida pela API
                    <img alt="" loading="lazy" src={mediaUrl(item.id, { mini: item.media.hasThumb })} />
                  ) : (
                    <span className="at-media-icon">
                      <Icon aria-hidden="true" size={28} />
                      <small>{item.media.name}</small>
                    </span>
                  )}
                  <span className="at-media-number">{item.number}</span>
                  {item.author !== "cliente" ? <span className="at-media-who">{item.authorName || "Equipe"}</span> : null}
                </button>
                <a className="at-media-open" href={mediaUrl(item.id, { download: true })} title="Baixar só esta">
                  <Download aria-hidden="true" size={14} />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
