"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/components/staff/quoteEditorShared";

/** "1.250,50" ou "80" → centavos; NaN se não der para ler. */
function toCents(text: string): number {
  const clean = text.trim();
  const value = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

/** Lançar ou retirar crédito do cliente (sempre com motivo). O saldo e o extrato vêm da página. */
export function CustomerCreditPanel({ customerRef }: { customerRef: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(sign: 1 | -1) {
    const cents = toCents(amount);
    if (!(cents > 0)) return setError("Digite o valor do crédito.");
    if (!reason.trim()) return setError("Escreva o motivo.");
    setBusy(true);
    setError(null);
    const { ok, data } = await postJson<{ message?: string }>("/api/backoffice/orcamento-editor/clientes/credito", { ref: customerRef, amountCents: sign * cents, reason })
      .catch(() => ({ ok: false, status: 0, data: { message: "Sem conexão. Tente de novo." } }));
    setBusy(false);
    if (!ok) return setError(data.message ?? "Não foi possível lançar o crédito.");
    setAmount("");
    setReason("");
    router.refresh();
  }

  return (
    <div className="cl-credit-form">
      <label className="qe-field"><span>Valor (R$)</span><input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} placeholder="0,00" value={amount} /></label>
      <label className="qe-field cl-credit-reason"><span>Motivo</span><input maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: pagou a mais no PED-0123" value={reason} /></label>
      <div className="qe-actions">
        <button className="qe-btn qe-btn-primary" disabled={busy} onClick={() => void send(1)} type="button">Adicionar crédito</button>
        <button className="qe-btn qe-btn-secondary" disabled={busy} onClick={() => void send(-1)} type="button">Retirar crédito</button>
      </div>
      {error ? <p className="qe-error">{error}</p> : null}
    </div>
  );
}
