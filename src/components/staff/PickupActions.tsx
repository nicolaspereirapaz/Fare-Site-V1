"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatCurrency, messageFor } from "@/components/backofficeShared";
import { OrderPaymentPanel } from "@/components/staff/OrderPaymentPanel";
import type { StatusPedido } from "@/lib/backoffice/orderStatus";
import { dueAtPickupCents } from "@/lib/orders/paymentPlan";
import type { OrderFinance } from "@/lib/orders/payments";
import type { PaymentMethod } from "@/lib/orders/repository";

/** Tela Retirada: "Cliente retirou" (ou "Entregue"), travado enquanto falta receber o que se paga na retirada. */
export function PickupActions({ orderId, status, paymentMethod, finance }: {
  orderId: string; status: StatusPedido; paymentMethod: PaymentMethod; finance: OrderFinance | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const due = dueAtPickupCents(finance);

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
      {due > 0 ? <p className="rt-lock">Falta receber {formatCurrency(due / 100)}. Registre o pagamento para liberar a {finance?.deliveryMode === "entrega" ? "entrega" : "retirada"}.</p> : null}
      {due > 0 && finance ? <OrderPaymentPanel compact finance={finance} onRecorded={() => router.refresh()} orderId={orderId} paymentMethod={paymentMethod} status={status} /> : null}
      <button className="rt-done" disabled={busy || due > 0} onClick={handOver} type="button">
        {busy ? "Salvando…" : finance?.deliveryMode === "entrega" ? "Entregue" : "Cliente retirou"}
      </button>
      {error ? <p className="qe-error" role="alert">{error}</p> : null}
    </div>
  );
}
