"use client";

import { Forward, X } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { api, displayName, formatPhone, type Conversation } from "@/components/staff/atendimento/shared";
import { foldText } from "@/lib/atendimento/search";

const MAX_TARGETS = 5;

/** Encaminhar: escolhe até 5 conversas e manda as mensagens marcadas (texto e mídia), como no WhatsApp. */
export function ForwardDialog({
  conversations,
  messageIds,
  onClose,
  onDone,
}: {
  conversations: Conversation[];
  messageIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const words = foldText(query).split(/\s+/).filter(Boolean);
    return conversations
      .filter((conversation) => words.every((word) => foldText(`${displayName(conversation)} ${conversation.contactName} ${conversation.phone}`).includes(word)))
      .slice(0, 60);
  }, [conversations, query]);

  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : current.length < MAX_TARGETS ? [...current, id] : current));

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api<{ sent: number; skipped: number }>("/api/atendimento/encaminhar", { method: "POST", body: { messageIds, conversationIds: chosen } }));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Não foi possível encaminhar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kb-scrim" onMouseDown={(event) => event.target === event.currentTarget && (result ? onDone() : onClose())}>
      <div aria-labelledby={titleId} aria-modal="true" className="kb-dialog at-new-dialog" role="dialog">
        <header className="kb-dialog-head">
          <div>
            <h2 id={titleId}>Encaminhar {messageIds.length} mensage{messageIds.length > 1 ? "ns" : "m"}</h2>
            <p className="at-muted">Escolha até {MAX_TARGETS} conversas.</p>
          </div>
          <button aria-label="Fechar" className="kb-dialog-close" onClick={result ? onDone : onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        {result ? (
          <div className="kb-dialog-body at-form">
            <p role="status">
              Encaminhado: {result.sent} mensage{result.sent === 1 ? "m" : "ns"} enviada{result.sent === 1 ? "" : "s"}.
              {result.skipped ? ` ${result.skipped} ficaram de fora (mídia já apagada e sem texto).` : ""}
            </p>
            <div className="at-form-actions">
              <button className="at-btn at-btn-primary" onClick={onDone} type="button">Fechar</button>
            </div>
          </div>
        ) : (
          <div className="kb-dialog-body at-form">
            <input aria-label="Buscar conversa" autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome ou número" value={query} />
            <ul className="at-forward-list">
              {list.map((conversation) => (
                <li key={conversation.id}>
                  <label>
                    <input
                      checked={chosen.includes(conversation.id)}
                      disabled={!chosen.includes(conversation.id) && chosen.length >= MAX_TARGETS}
                      onChange={() => toggle(conversation.id)}
                      type="checkbox"
                    />
                    <span>
                      {displayName(conversation)}
                      <small> {conversation.waChatId?.endsWith("@g.us") ? "Grupo" : formatPhone(conversation.phone)}</small>
                    </span>
                  </label>
                </li>
              ))}
              {!list.length ? <li className="at-muted">Nenhuma conversa encontrada.</li> : null}
            </ul>
            {error ? <p className="at-form-error" role="alert">{error}</p> : null}
            <div className="at-form-actions">
              <button className="at-btn" onClick={onClose} type="button">Cancelar</button>
              <button className="at-btn at-btn-primary" disabled={busy || !chosen.length} onClick={() => void send()} type="button">
                <Forward aria-hidden="true" size={16} /> {busy ? "Encaminhando…" : `Encaminhar${chosen.length ? ` (${chosen.length})` : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
