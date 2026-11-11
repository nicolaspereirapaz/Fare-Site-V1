"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCurrency, messageFor } from "@/components/backofficeShared";
import { RecordPaymentDialog } from "@/components/staff/RecordPaymentDialog";
import { dueAtPickupCents } from "@/lib/orders/paymentPlan";
import type { OrderFinance } from "@/lib/orders/payments";
import type { PaymentMethod } from "@/lib/orders/repository";

/**
 * Tela Retirada: um botão só. Falta pagar: "Registrar pagamento" (abre a janela de recebimento);
 * pago: vira "Cliente retirou" ("Entregue" na entrega).
 */
export function PickupActions({ orderId, code, customerName, paymentMethod, finance: initialFinance }: {
  orderId: string; code: string; customerName: string; paymentMethod: PaymentMethod; finance: OrderFinance | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [confirmed, setConfirmed] = useState<OrderFinance | null>(null);
  // Logo depois do recebimento a tela ainda não recarregou: vale o financeiro confirmado.
  const finance = confirmed && initialFinance && confirmed.paidCents > initialFinance.paidCents ? confirmed : initialFinance;
  const due = dueAtPickupCents(finance);
  const delivery = finance?.deliveryMode === "entrega";

  async function handOver() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/backoffice/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "concluido" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? messageFor(payload.error));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rt-actions">
      {due > 0 && finance ? (
        <>
          <p className="rt-lock">Falta receber {formatCurrency(due / 100)}</p>
          <button className="rt-done rt-pay-button" onClick={() => setPaying(true)} type="button">Registrar pagamento</button>
          {paying ? (
            <RecordPaymentDialog code={code} customerName={customerName} finance={finance} onClose={() => setPaying(false)} orderId={orderId} paymentMethod={paymentMethod}
              onRecorded={(next) => { setConfirmed(next); setPaying(false); router.refresh(); }} />
          ) : null}
        </>
      ) : (
        <button className="rt-done" disabled={busy} onClick={handOver} type="button">
          {busy ? "Salvando…" : delivery ? "Entregue" : "Cliente retirou"}
        </button>
      )}
      {error ? <p className="qe-error" role="alert">{error}</p> : null}
    </div>
  );
}
