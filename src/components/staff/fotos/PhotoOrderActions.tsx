"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, Trash2 } from "lucide-react";

/** Caminho da pasta (copiar para abrir no Explorer) e "Apagar fotos", com confirmação na própria tela. */
export function PhotoOrderActions({ id, folder, deleted }: { id: string; folder: string; deleted: boolean }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(folder);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não deu para copiar: selecione o caminho e copie.");
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/equipe/fotos/${id}`, { method: "DELETE" });
    setPending(false);
    setConfirming(false);
    if (!response.ok) {
      setError("Não foi possível apagar agora.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="pf-actions">
      <div className="pf-folder">
        <span>Pasta do pedido</span>
        {/* Só o nome da pasta na tela; "Copiar caminho" leva o caminho inteiro. */}
        <code title={folder}>{folder.split(/[\\/]/).pop()}</code>
        <button className="button button-secondary" onClick={copy} type="button">
          {copied ? <><Check aria-hidden="true" size={16} /> Copiado</> : <><Copy aria-hidden="true" size={16} /> Copiar caminho</>}
        </button>
      </div>
      {deleted ? null : confirming ? (
        <div className="pf-confirm" role="alert">
          <span>Apagar as fotos deste pedido? Os arquivos prontos e os originais saem da pasta; o documento do pedido fica.</span>
          <button className="button pf-danger" disabled={pending} onClick={remove} type="button">
            <Trash2 aria-hidden="true" size={16} /> {pending ? "Apagando…" : "Sim, apagar"}
          </button>
          <button className="button button-secondary" disabled={pending} onClick={() => setConfirming(false)} type="button">Cancelar</button>
        </div>
      ) : (
        <button className="pf-delete" onClick={() => setConfirming(true)} type="button"><Trash2 aria-hidden="true" size={16} /> Apagar fotos</button>
      )}
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
    </div>
  );
}
