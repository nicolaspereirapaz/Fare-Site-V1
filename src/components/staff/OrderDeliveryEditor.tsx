"use client";

import { useState } from "react";
import { messageFor } from "@/components/backofficeShared";
import { AddressFields } from "@/components/staff/AddressFields";
import { EMPTY_ADDRESS, type DeliveryAddress } from "@/lib/customers/address";

/** Alterar, no pedido já criado: data/horário, retirada ou entrega e o endereço só deste pedido. */
export function OrderDeliveryEditor({ orderId, date, time, mode, address, customerAddress, onSaved }: {
  orderId: string; date: string | null | undefined; time: string | null | undefined;
  mode: "retirada" | "entrega"; address: DeliveryAddress | null | undefined;
  /** Endereço do cadastro do cliente (vale quando o do pedido fica em branco). */
  customerAddress?: string;
  onSaved: () => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: "", time: "", mode, address: EMPTY_ADDRESS });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!open) {
    return <button className="kb-edit-quote" onClick={() => { setForm({ date: date ?? "", time: time ?? "", mode, address: address ?? EMPTY_ADDRESS }); setError(""); setOpen(true); }} type="button">Alterar entrega</button>;
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/backoffice/orders/${orderId}/entrega`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryDate: form.date || null, deliveryTime: form.date && form.time ? form.time : null,
          deliveryMode: form.mode, deliveryAddress: form.mode === "entrega" ? form.address : null,
        }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? messageFor(payload.error));
      await onSaved();
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível alterar."); } finally { setBusy(false); }
  }
  return <div className="sd-delivery-edit">
    <label>Forma de entrega
      <select disabled={busy} onChange={(e) => setForm({ ...form, mode: e.target.value as "retirada" | "entrega" })} value={form.mode}>
        <option value="retirada">Retirada na loja</option>
        <option value="entrega">Entrega ao cliente</option>
      </select>
    </label>
    <label>Data de entrega<input disabled={busy} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
    <label>Horário (opcional)<input disabled={busy || !form.date} type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></label>
    {form.mode === "entrega" ? (
      <AddressFields
        hint={customerAddress ? `Em branco: usa o do cadastro (${customerAddress}).` : "Em branco: usa o endereço do cadastro do cliente."}
        onChange={(update) => setForm((current) => ({ ...current, address: update(current.address) }))}
        value={form.address}
      />
    ) : null}
    {error ? <p className="qe-error" role="alert">{error}</p> : null}
    <div className="kb-receipt-actions"><button className="kb-final" disabled={busy} onClick={save} type="button">{busy ? "Salvando…" : "Salvar"}</button><button className="kb-edit-quote" disabled={busy} onClick={() => setOpen(false)} type="button">Cancelar</button></div>
  </div>;
}
