"use client";

import { Download, FileText, Images, Mic, Video, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatBytes, mediaUrl } from "@/components/staff/atendimento/media";
import { api, displayName, type Conversation } from "@/components/staff/atendimento/shared";
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
 * clique na primeira e na última (ou digite "De" e "Até") e baixe o ZIP.
 */
export function MediaDialog({ conversation, onClose }: { conversation: Conversation; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("todas");
  const [onlyCustomer, setOnlyCustomer] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

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
  const start = Number(from) || 1;
  const end = Number(to) || total;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const selected = visible.filter((item) => item.number >= low && item.number <= high);
  const hasRange = Boolean(from || to);

  /** 1º clique = "De"; 2º = "Até"; 3º recomeça. */
  function pick(number: number) {
    if (!from || (from && to)) {
      setFrom(String(number));
      setTo("");
    } else {
      setTo(String(number));
    }
  }

  const zipUrl = (all: boolean) => {
    const params = new URLSearchParams();
    if (!all) {
      params.set("de", String(low));
      params.set("ate", String(high));
    }
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
              Para baixar várias: clique na <strong>primeira</strong> e na <strong>última</strong> (ou digite os números) e baixe o ZIP. Os arquivos saem na qualidade em que chegaram.
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
              De nº <input inputMode="numeric" max={total} min={1} onChange={(event) => setFrom(event.target.value.replace(/\D/g, ""))} placeholder="1" value={from} />
            </label>
            <label>
              até nº <input inputMode="numeric" max={total} min={1} onChange={(event) => setTo(event.target.value.replace(/\D/g, ""))} placeholder={String(total || "")} value={to} />
            </label>
            {hasRange ? (
              <button className="at-btn at-btn-quiet" onClick={() => { setFrom(""); setTo(""); }} type="button">
                Limpar
              </button>
            ) : null}
          </span>
          <span className="at-media-actions">
            <a aria-disabled={!selected.length} className={`at-btn at-btn-primary${selected.length ? "" : " is-disabled"}`} download href={selected.length ? zipUrl(false) : undefined}>
              <Download aria-hidden="true" size={16} /> {hasRange ? `Baixar nº ${low} a ${high}` : "Baixar todas"} · {selected.length} {selected.length === 1 ? "arquivo" : "arquivos"}
            </a>
          </span>
        </div>

        {error ? <div className="at-banner at-banner-error" role="alert">{error}</div> : null}
        {!items && !error ? <p className="at-muted at-center at-media-status">Carregando…</p> : null}
        {items && !visible.length ? <p className="at-muted at-center at-media-status">Nenhuma mídia {items.length ? "com esse filtro" : "nesta conversa"}.</p> : null}

        <ul className="at-media-grid">
          {visible.map((item) => {
            const inRange = hasRange && item.number >= low && item.number <= high;
            const Icon = item.media.mime.startsWith("video/") ? Video : item.media.mime.startsWith("audio/") ? Mic : FileText;
            return (
              <li className={inRange ? "is-selected" : undefined} key={item.id}>
                <button
                  aria-label={`Mídia nº ${item.number}: ${item.media.name}. Clique para marcar o início ou o fim da seleção.`}
                  className="at-media-tile"
                  onClick={() => pick(item.number)}
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
