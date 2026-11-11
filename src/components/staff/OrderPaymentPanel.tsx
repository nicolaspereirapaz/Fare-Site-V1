"use client";
import { useState } from "react";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";
import type { OrderFinance } from "@/lib/orders/payments";
import type { PaymentMethod } from "@/lib/orders/repository";
import { formatCurrency } from "@/components/backofficeShared";
import { RecordPaymentDialog } from "@/components/staff/RecordPaymentDialog";
import { dateLabel, deliveryLabel } from "@/components/staff/paymentFieldsShared";

/** Pagamento do pedido: "Registrar pagamento" abre a janela de recebimento (mesmo visual de Fechar Orçamento). */
export function OrderPaymentPanel({ orderId, status, paymentMethod, finance: initialFinance, onRecorded, compact = false, code = "", customerName = "" }: {
  orderId: string; status: StatusPedido; paymentMethod: PaymentMethod; finance: OrderFinance; onRecorded: () => void | Promise<void>; compact?: boolean;
  /** Cabeçalho da janela: número do pedido e cliente. */
  code?: string; customerName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<OrderFinance | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  // Recebimentos são cumulativos; prevalece o snapshot confirmado mais novo.
  const finance = confirmed && confirmed.paidCents > initialFinance.paidCents ? confirmed : initialFinance;
  const canReceive = finance.balanceCents > 0 && !needsRefresh && !["cancelado", "concluido"].includes(status);
  async function refreshBoard() {
    setBusy(true);
    try { await onRecorded(); setNeedsRefresh(false); }
    catch { setNeedsRefresh(true); }
    finally { setBusy(false); }
  }
  async function recorded(next: OrderFinance) {
    setConfirmed(next);
    setOpen(false);
    // Falha de leitura não desfaz o recebimento nem habilita repetir seu POST.
    try { await onRecorded(); setNeedsRefresh(false); }
    catch { setNeedsRefresh(true); }
  }
  return <section className={`kb-payment-panel${compact ? " sd-payment-compact" : ""}`}>
    {!compact ? <><h3>Pagamento e entrega</h3>
    <div className="kb-dialog-grid"><p><strong>Já pago {formatCurrency(finance.paidCents / 100)}</strong><span className={finance.balanceCents > 0 ? "kb-payment-balance" : undefined}>Falta pagar {formatCurrency(finance.balanceCents / 100)}</span>
      {finance.installments ? <span>Crédito em {finance.installments}×</span> : null}{finance.dueDate ? <span>Vencimento {dateLabel(finance.dueDate)}</span> : null}
    </p><p><strong>Entrega prevista {deliveryLabel(finance.deliveryDate, finance.deliveryTime)}</strong><span>{finance.deliveryMode === "retirada" ? "Retirada na loja" : "Entrega ao cliente"}</span></p></div></> : null}
    {needsRefresh ? <p role="status">Pagamento registrado. Não foi possível atualizar o quadro. <button className="kb-edit-quote" disabled={busy} onClick={refreshBoard} type="button">Atualizar quadro</button></p> : null}
    {canReceive ? <button className="kb-edit-quote" onClick={() => setOpen(true)} type="button">Registrar pagamento</button> : null}
    {open ? <RecordPaymentDialog code={code} customerName={customerName} finance={finance} onClose={() => setOpen(false)} onRecorded={recorded} orderId={orderId} paymentMethod={paymentMethod} /> : null}
  </section>;
}
