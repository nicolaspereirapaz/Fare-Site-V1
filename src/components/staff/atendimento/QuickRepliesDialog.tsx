"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { api, type QuickReply } from "@/components/staff/atendimento/shared";

type Draft = { id?: string; shortcut: string; title: string; body: string };
const EMPTY_DRAFT: Draft = { shortcut: "", title: "", body: "" };

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
      await api(draft.id ? `/api/atendimento/respostas/${draft.id}` : "/api/atendimento/respostas", {
        method: draft.id ? "PATCH" : "POST",
        body: { shortcut: draft.shortcut, title: draft.title, body: draft.body },
      });
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
              <p className="at-muted">Use *asteriscos* para negrito, como no WhatsApp.</p>
              <div className="at-form-actions">
                <button className="at-btn" onClick={() => setDraft(null)} type="button">Cancelar</button>
                <button className="at-btn at-btn-primary" disabled={saving} type="submit">{draft.id ? "Salvar" : "Adicionar"}</button>
              </div>
            </form>
          ) : (
            <button className="at-btn at-btn-orange" onClick={() => setDraft(EMPTY_DRAFT)} type="button">
              <Plus aria-hidden="true" size={16} /> Nova mensagem rápida
            </button>
          )}
          <ul className="at-qr-list">
            {quickReplies.map((reply) => (
              <li key={reply.id}>
                <div>
                  <code>/{reply.shortcut}</code> <strong>{reply.title}</strong>
                  <p>{reply.body}</p>
                </div>
                <div className="at-qr-actions">
                  <button aria-label={`Editar /${reply.shortcut}`} className="at-icon-btn" onClick={() => setDraft({ id: reply.id, shortcut: reply.shortcut, title: reply.title, body: reply.body })} type="button">
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
