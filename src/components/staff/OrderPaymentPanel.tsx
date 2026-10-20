"use client";
import { useRef, useState } from "react";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";
import type { OrderFinance } from "@/lib/orders/payments";
import type { PaymentMethod } from "@/lib/orders/repository";
import { formatCurrency } from "@/components/backofficeShared";
import { dateLabel, deliveryLabel, paidCents, STAFF_PAYMENT_LABELS, todayInBrazil } from "@/components/staff/paymentFieldsShared";

type ReceiptSubmission = { idempotencyKey: string; amountCents: number; paymentMethod: PaymentMethod; paidAt: string };
export function OrderPaymentPanel({ orderId, status, paymentMethod, finance: initialFinance, onRecorded, compact = false }: {
  orderId: string; status: StatusPedido; paymentMethod: PaymentMethod; finance: OrderFinance; onRecorded: () => void | Promise<void>; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((initialFinance.balanceCents / 100).toFixed(2).replace(".", ","));
  const [method, setMethod] = useState(paymentMethod);
  const [date, setDate] = useState(todayInBrazil);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<OrderFinance | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  // Recebimentos são cumulativos; prevalece o snapshot confirmado mais novo.
  const finance = confirmed && confirmed.paidCents > initialFinance.paidCents ? confirmed : initialFinance;
  const pending = useRef<ReceiptSubmission | null>(null);
  const inFlight = useRef(false);
  const canReceive = finance.balanceCents > 0 && !needsRefresh && !["cancelado", "concluido"].includes(status);
  async function refreshBoard() {
    setBusy(true);
    try { await onRecorded(); setNeedsRefresh(false); }
    catch { setNeedsRefresh(true); }
    finally { setBusy(false); }
  }
  async function save() {
    if (inFlight.current || (!canReceive && !pending.current)) return;
    if (!pending.current) {
      const cents = paidCents(amount);
      if (cents === null || cents <= 0 || cents > finance.balanceCents || !date) return setError("Confira valor e data. O recebimento não pode ultrapassar o saldo.");
      // Payload e chave permanecem imutáveis enquanto a resposta for incerta.
      pending.current = { idempotencyKey: crypto.randomUUID(), amountCents: cents, paymentMethod: method, paidAt: date };
      setAwaitingResponse(true);
    }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/backoffice/orders/${orderId}/pagamentos`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
      });
      const payload = await response.json() as { message?: string; finance?: OrderFinance };
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) { pending.current = null; setAwaitingResponse(false); }
        throw new Error(payload.message ?? "Não foi possível registrar o pagamento.");
      }
      if (!payload.finance || !Number.isSafeInteger(payload.finance.paidCents) || !Number.isSafeInteger(payload.finance.balanceCents)) throw new Error("Resposta incompleta do recebimento.");
      setConfirmed(payload.finance); pending.current = null; setAwaitingResponse(false); setOpen(false);
      setAmount((payload.finance.balanceCents / 100).toFixed(2).replace(".", ","));
      // Falha de leitura não desfaz o recebimento nem habilita repetir seu POST.
      try { await onRecorded(); setNeedsRefresh(false); }
      catch { setNeedsRefresh(true); }
    } catch (caught) { setError(pending.current ? "Não foi possível confirmar a resposta. Clique em Confirmar recebimento para reenviar os mesmos dados, sem duplicar." : caught instanceof Error ? caught.message : "Não foi possível registrar o pagamento."); }
    finally { setBusy(false); inFlight.current = false; }
  }
  const fieldsLocked = busy || awaitingResponse;
  return <section className={`kb-payment-panel${compact ? " sd-payment-compact" : ""}`}>
    {!compact ? <><h3>Pagamento e entrega</h3>
    <div className="kb-dialog-grid"><p><strong>Já pago {formatCurrency(finance.paidCents / 100)}</strong><span className={finance.balanceCents > 0 ? "kb-payment-balance" : undefined}>Falta pagar {formatCurrency(finance.balanceCents / 100)}</span>
      {finance.installments ? <span>Crédito em {finance.installments}×</span> : null}{finance.dueDate ? <span>Vencimento {dateLabel(finance.dueDate)}</span> : null}
    </p><p><strong>Entrega prevista {deliveryLabel(finance.deliveryDate, finance.deliveryTime)}</strong><span>{finance.deliveryMode === "retirada" ? "Retirada na loja" : "Entrega ao cliente"}</span></p></div></> : null}
    {needsRefresh ? <p role="status">Pagamento registrado. Não foi possível atualizar o quadro. <button className="kb-edit-quote" disabled={busy} onClick={refreshBoard} type="button">Atualizar quadro</button></p> : null}
    {canReceive && !open ? <button className="kb-edit-quote" onClick={() => setOpen(true)} type="button">Registrar pagamento</button> : null}
    {(canReceive || awaitingResponse) && open ? <div className="kb-receipt-form">
      <label>Valor recebido (R$)<input disabled={fieldsLocked} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Forma do recebimento<select disabled={fieldsLocked} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{Object.entries(STAFF_PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Data do recebimento<input disabled={fieldsLocked} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="kb-receipt-actions"><button className="kb-final" disabled={busy} onClick={save} type="button">{busy ? "Registrando…" : "Confirmar recebimento"}</button><button className="kb-edit-quote" disabled={fieldsLocked} onClick={() => setOpen(false)} type="button">Cancelar</button></div>
    </div> : null}
    {error ? <p role="alert" className="kb-payment-balance">{error}</p> : null}
  </section>;
}
