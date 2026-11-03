"use client";

import { MessageSquarePlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { api, type Conversation } from "@/components/staff/atendimento/shared";

/** "Nova conversa": digita o WhatsApp (e o nome, se souber) e a conversa abre com você, pronta para escrever. */
export function NewConversationDialog({ onClose, onStarted }: { onClose: () => void; onStarted: (conversation: Conversation) => void }) {
  const titleId = useId();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phoneInput.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ conversation: Conversation }>("/api/atendimento/conversas/nova", { method: "POST", body: { phone, name } });
      onStarted(data.conversation);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Não foi possível chamar esse número.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kb-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby={titleId} aria-modal="true" className="kb-dialog at-new-dialog" role="dialog">
        <header className="kb-dialog-head">
          <div>
            <h2 id={titleId}>Nova conversa</h2>
            <p className="at-muted">Chame um cliente pelo WhatsApp da loja. A conversa abre com você.</p>
          </div>
          <button aria-label="Fechar" className="kb-dialog-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="kb-dialog-body at-form" onSubmit={(event) => void start(event)}>
          <label>
            WhatsApp (com DDD)
            <input autoComplete="off" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder="(11) 98888-7777" ref={phoneInput} required value={phone} />
          </label>
          <label>
            Nome (opcional)
            <input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Maria Souza" value={name} />
          </label>
          <p className="at-muted">Se o número já tiver cadastro no site, o cadastro é usado; senão, criamos um com esse nome.</p>
          {error ? <p className="at-form-error" role="alert">{error}</p> : null}
          <div className="at-form-actions">
            <button className="at-btn" onClick={onClose} type="button">Cancelar</button>
            <button className="at-btn at-btn-primary" disabled={busy || phone.replace(/\D/g, "").length < 10} type="submit">
              <MessageSquarePlus aria-hidden="true" size={16} /> {busy ? "Chamando…" : "Chamar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
