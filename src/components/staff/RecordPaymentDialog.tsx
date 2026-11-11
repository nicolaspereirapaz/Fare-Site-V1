"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailsDialog } from "@/components/backofficeShared";
import { brl, moneyInput } from "@/components/staff/quoteEditorShared";
import { paidCents, STAFF_PAYMENT_LABELS, todayInBrazil } from "@/components/staff/paymentFieldsShared";
import type { OrderFinance } from "@/lib/orders/payments";
import type { PaymentMethod } from "@/lib/orders/repository";
import "@/components/staff/closeQuote.css";

type Choice = "balance" | "half" | "other";
type Submission = { idempotencyKey: string; amountCents: number; paymentMethod: PaymentMethod; paidAt: string };

/**
 * Janela "Registrar pagamento" de um pedido (mesmo visual de "Fechar Orçamento"): sugestões de valor,
 * forma e data, e o saldo que sobra. Resposta perdida: reenvia os mesmos dados com a mesma chave (não duplica).
 */
export function RecordPaymentDialog({ orderId, code, customerName, finance, paymentMethod, onClose, onRecorded }: {
  orderId: string; code: string; customerName: string; finance: OrderFinance; paymentMethod: PaymentMethod;
  onClose: () => void; onRecorded: (finance: OrderFinance) => void | Promise<void>;
}) {
  const balance = finance.balanceCents;
  const total = finance.paidCents + balance;
  // Sinal de 50% só faz sentido antes do primeiro recebimento.
  const half = finance.paidCents === 0 && Math.ceil(total / 2) < balance ? Math.ceil(total / 2) : null;
  const [choice, setChoice] = useState<Choice>("balance");
  const [amount, setAmount] = useState(moneyInput(balance / 100));
  const [method, setMethod] = useState<PaymentMethod>(paymentMethod);
  const [date, setDate] = useState(todayInBrazil);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submission = useRef<Submission | null>(null);
  const inFlight = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (choice === "other") amountRef.current?.focus(); }, [choice]);
  const safeClose = useCallback(() => { if (!inFlight.current && !submission.current) onClose(); }, [onClose]);

  const cents = paidCents(amount);
  const valid = cents !== null && cents > 0 && cents <= balance;
  const left = valid ? balance - cents : null;
  const when = finance.dueDate ? "até o vencimento" : finance.deliveryMode === "entrega" ? "na entrega" : "na retirada";
  const status = !amount.trim() || cents === 0 ? "Informe o valor recebido." : !valid ? `Confira o valor: o recebimento vai até ${brl(balance / 100)}.` : left === 0 ? "Pagamento completo · nenhum saldo pendente." : `Recebimento parcial · ainda falta ${brl(left! / 100)} ${when}.`;

  function choose(next: Choice, value: number | null) {
    setChoice(next);
    setAmount(value === null ? "" : moneyInput(value / 100));
    setError("");
  }

  async function save() {
    if (inFlight.current) return;
    if (!submission.current) {
      if (!valid) return setError(status);
      if (!date) return setError("Informe a data do pagamento.");
      submission.current = { idempotencyKey: crypto.randomUUID(), amountCents: cents!, paymentMethod: method, paidAt: date };
      setPending(true);
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/backoffice/orders/${orderId}/pagamentos`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission.current),
      });
      const payload = (await response.json()) as { message?: string; finance?: OrderFinance };
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) { submission.current = null; setPending(false); }
        throw new Error(payload.message ?? "Não foi possível registrar o pagamento.");
      }
      if (!payload.finance || !Number.isSafeInteger(payload.finance.paidCents) || !Number.isSafeInteger(payload.finance.balanceCents)) throw new Error("Resposta incompleta do recebimento.");
      submission.current = null;
      setPending(false);
      inFlight.current = false;
      await onRecorded(payload.finance);
    } catch (caught) {
      setError(submission.current ? "Não foi possível confirmar a resposta. Clique em Confirmar recebimento para reenviar os mesmos dados, sem duplicar." : caught instanceof Error ? caught.message : "Não foi possível registrar o pagamento.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const tiles = 2 + (half === null ? 0 : 1);
  return (
    <DetailsDialog className="cq-dialog rp-dialog" code={code} onClose={safeClose} status={`Saldo ${brl(balance / 100)}`} statusColor={{ bg: "#fdecec", fg: "#a12a2a" }} subtitle={customerName} title="Registrar pagamento"
      footer={<><span className="cq-caption">O recebimento fica no histórico e no financeiro do pedido.</span><div className="cq-actions">
        <button className="cq-cancel" disabled={busy || pending} onClick={safeClose} type="button">Cancelar</button>
        <button className="cq-confirm" disabled={busy || (!pending && !valid)} onClick={save} type="button">{busy ? "Registrando…" : "Confirmar recebimento"}</button>
      </div></>}>
      <section aria-label="Saldo do pedido" className="cq-total"><div><strong>Saldo a receber</strong><p>Total {brl(total / 100)} · já pago {brl(finance.paidCents / 100)}</p></div><span>{brl(balance / 100)}</span></section>
      <fieldset className="cq-fields" disabled={busy || pending}>
        <section>
          <h3>Quanto o cliente pagou?</h3>
          <p className="cq-hint">Escolha uma sugestão ou informe o valor recebido.</p>
          <div aria-label="Sugestões de recebimento" className={`cq-suggestions rp-tiles-${tiles}`}>
            <button aria-pressed={choice !== "other" && cents === balance} onClick={() => choose("balance", balance)} type="button"><strong>Valor que falta</strong><span>{brl(balance / 100)}</span></button>
            {half !== null ? <button aria-pressed={choice !== "other" && cents === half} onClick={() => choose("half", half)} type="button"><strong>50% de sinal</strong><span>{brl(half / 100)}</span></button> : null}
            <button aria-pressed={choice === "other"} onClick={() => choose("other", null)} type="button"><strong>Outro valor</strong><span>Digitar recebimento</span></button>
          </div>
          <div className="cq-grid">
            <label className="cq-field"><span>Valor recebido agora</span><div className="cq-money"><b aria-hidden="true">R$</b><input aria-invalid={!!amount.trim() && !valid} aria-label="Valor recebido agora" autoComplete="off" inputMode="decimal" onChange={(event) => { setAmount(event.target.value); setChoice("other"); setError(""); }} placeholder="0,00" ref={amountRef} value={amount} /></div></label>
            <label className="cq-field"><span>Forma de pagamento</span><select onChange={(event) => setMethod(event.target.value as PaymentMethod)} value={method}>{Object.entries(STAFF_PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="cq-field"><span>Data do pagamento</span><input onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>
          </div>
          <div aria-label="Resumo do recebimento" aria-live="polite" className={`cq-balance${left === 0 ? " is-paid" : ""}`}>
            <div><span>Recebido agora</span><strong>{valid ? brl(cents! / 100) : "—"}</strong></div>
            <div><span>Saldo restante</span><strong>{left === null ? "—" : brl(left / 100)}</strong></div>
          </div>
          <p className="cq-state" role="status">{status}</p>
        </section>
      </fieldset>
      {error ? <p className="qe-error" role="alert">{error}</p> : null}
    </DetailsDialog>
  );
}
