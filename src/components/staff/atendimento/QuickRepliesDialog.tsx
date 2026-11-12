"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { formatBytes, uploadFile } from "@/components/staff/atendimento/media";
import { api, type QuickReply } from "@/components/staff/atendimento/shared";

/** file: anexo novo escolhido; removeMedia: tirar o anexo atual. */
type Draft = { id?: string; shortcut: string; title: string; body: string; media?: QuickReply["media"]; file?: File | null; removeMedia?: boolean };
const EMPTY_DRAFT: Draft = { shortcut: "", title: "", body: "" };

export const quickReplyMediaUrl = (id: string, mini = false) => `/api/atendimento/respostas/${id}/anexo${mini ? "?mini=1" : ""}`;

/** Lista única de mensagens rápidas da equipe: criar, editar e apagar. */
export function QuickRepliesDialog({ quickReplies, onClose, onChanged }: { quickReplies: QuickReply[]; onClose: () => void; onChanged: (list: QuickReply[]) => void }) {
  const titleId = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function reload() {
    const data = await api<{ quickReplies: QuickReply[] }>("/api/atendimento/respostas");
    onChanged(data.quickReplies);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api<{ quickReply: QuickReply }>(draft.id ? `/api/atendimento/respostas/${draft.id}` : "/api/atendimento/respostas", {
        method: draft.id ? "PATCH" : "POST",
        body: { shortcut: draft.shortcut, title: draft.title, body: draft.body, removeMedia: Boolean(draft.removeMedia && !draft.file) },
      });
      if (draft.file) await uploadFile(`/api/atendimento/upload/respostas/${saved.quickReply.id}`, draft.file);
      await reload();
      setDraft(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(reply: QuickReply) {
    if (!window.confirm(`Apagar a mensagem rápida /${reply.shortcut}?`)) return;
    try {
      await api(`/api/atendimento/respostas/${reply.id}`, { method: "DELETE" });
      await reload();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Não foi possível apagar.");
    }
  }

  return (
    <div className="kb-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby={titleId} aria-modal="true" className="kb-dialog at-qr-dialog" role="dialog">
        <header className="kb-dialog-head">
          <div>
            <h2 id={titleId}>Mensagens rápidas</h2>
            <p className="at-muted">Na conversa, digite <code>/</code> e o atalho (ex.: <code>/horario</code>). A lista é a mesma para toda a equipe.</p>
          </div>
          <button aria-label="Fechar" className="kb-dialog-close" onClick={onClose} ref={closeRef} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="kb-dialog-body">
          {error ? <p className="at-form-error" role="alert">{error}</p> : null}
          {draft ? (
            <form
              className="at-form at-qr-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="at-qr-form-row">
                <label>
                  Atalho
                  <span className="at-qr-shortcut">
                    <span>/</span>
                    <input autoFocus maxLength={30} onChange={(event) => setDraft({ ...draft, shortcut: event.target.value })} placeholder="pix" required value={draft.shortcut} />
                  </span>
                </label>
                <label>
                  Título
                  <input maxLength={60} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Chave Pix" required value={draft.title} />
                </label>
              </div>
              <label>
                Texto que vai para o cliente
                <textarea maxLength={2000} onChange={(event) => setDraft({ ...draft, body: event.target.value })} required rows={5} value={draft.body} />
              </label>
              <p className="at-muted">Use *asteriscos* para negrito, como no WhatsApp. {"{saudacao}"} vira Bom dia/Boa tarde/Boa noite, {"{nome}"} o primeiro nome do cliente e {"{pix}"} manda o Pix com o botão de copiar.</p>
              <div className="at-qr-attach">
                <span>Anexo (opcional) — vai junto, com o texto como legenda:</span>
                {draft.file ? (
                  <span className="at-qr-file">
                    <Paperclip aria-hidden="true" size={14} /> {draft.file.name} <small>{formatBytes(draft.file.size)}</small>
                    <button className="at-btn at-btn-quiet" onClick={() => setDraft({ ...draft, file: null })} type="button">Tirar</button>
                  </span>
                ) : draft.media && !draft.removeMedia ? (
                  <span className="at-qr-file">
                    {draft.media.mime.startsWith("image/") && draft.id ? (
                      // eslint-disable-next-line @next/next/no-img-element -- anexo privado servido pela API
                      <img alt="" src={quickReplyMediaUrl(draft.id, draft.media.hasThumb)} />
                    ) : (
                      <Paperclip aria-hidden="true" size={14} />
                    )}
                    {draft.media.name} <small>{formatBytes(draft.media.size)}</small>
                    <button className="at-btn at-btn-quiet" onClick={() => setDraft({ ...draft, removeMedia: true })} type="button">Tirar</button>
                  </span>
                ) : (
                  <label className="at-btn at-qr-pick">
                    <Paperclip aria-hidden="true" size={15} /> Escolher imagem ou arquivo
                    <input
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) setDraft({ ...draft, file });
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                )}
              </div>
              <div className="at-form-actions">
                <button className="at-btn" onClick={() => setDraft(null)} type="button">Cancelar</button>
                <button className="at-btn at-btn-primary" disabled={saving} type="submit">{draft.id ? "Salvar" : "Adicionar"}</button>
              </div>
            </form>
          ) : (
            <button className="at-btn at-btn-primary" onClick={() => setDraft(EMPTY_DRAFT)} type="button">
              <Plus aria-hidden="true" size={16} /> Nova mensagem rápida
            </button>
          )}
          <ul className="at-qr-list">
            {quickReplies.map((reply) => (
              <li key={reply.id}>
                <div>
                  <code>/{reply.shortcut}</code> <strong>{reply.title}</strong>
                  <p>{reply.body}</p>
                  {reply.media ? (
                    <p className="at-qr-has-media">
                      <Paperclip aria-hidden="true" size={12} /> {reply.media.name}
                    </p>
                  ) : null}
                </div>
                <div className="at-qr-actions">
                  <button aria-label={`Editar /${reply.shortcut}`} className="at-icon-btn" onClick={() => setDraft({ id: reply.id, shortcut: reply.shortcut, title: reply.title, body: reply.body, media: reply.media })} type="button">
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                  <button aria-label={`Apagar /${reply.shortcut}`} className="at-icon-btn at-icon-danger" onClick={() => void remove(reply)} type="button">
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
