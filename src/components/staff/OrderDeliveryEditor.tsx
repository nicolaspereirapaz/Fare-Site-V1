"use client";

import { useState } from "react";
import { messageFor } from "@/components/backofficeShared";

/** Alterar data/horário de entrega previstos de um pedido já criado. */
export function OrderDeliveryEditor({ orderId, date, time, onSaved }: {
  orderId: string; date: string | null | undefined; time: string | null | undefined; onSaved: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", time: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) return <button className="kb-edit-quote" onClick={() => { setForm({ date: date ?? "", time: time ?? "" }); setError(""); setOpen(true); }} type="button">Alterar data</button>;
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/backoffice/orders/${orderId}/entrega`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryDate: form.date || null, deliveryTime: form.date && form.time ? form.time : null }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? messageFor(payload.error));
      await onSaved();
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível alterar."); } finally { setBusy(false); }
  }
  return <div className="sd-delivery-edit">
    <label>Data de entrega<input disabled={busy} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
    <label>Horário (opcional)<input disabled={busy || !form.date} type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label>
    {error ? <p className="qe-error" role="alert">{error}</p> : null}
    <div className="kb-receipt-actions"><button className="kb-final" disabled={busy} onClick={save} type="button">{busy ? "Salvando…" : "Salvar"}</button><button className="kb-edit-quote" disabled={busy} onClick={() => setOpen(false)} type="button">Cancelar</button></div>
  </div>;
}
