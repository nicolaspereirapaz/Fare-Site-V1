"use client";
import { useEffect, useState } from "react";
import type { Customer } from "@/components/staff/quoteEditorShared";
import "@/components/staff/quoteEditor.css";

/** Editar o cadastro do cliente (conta do site: e-mail é o login e fica fixo). */
export function CustomerEdit({ customerRef, onSaved, onCancel }: { customerRef: string; onSaved: (customer: Customer) => void; onCancel: () => void }) {
  const [form, setForm] = useState<{ name: string; company: string; phone: string; email: string; document: string; address: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const account = customerRef.startsWith("conta:");
  useEffect(() => {
    let active = true;
    fetch(`/api/backoffice/orcamento-editor/clientes?ref=${encodeURIComponent(customerRef)}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<{ customers?: Customer[] }>)
      .then((payload) => {
        const found = payload.customers?.[0];
        if (!active) return;
        if (!found) return setError("Cadastro não encontrado.");
        setForm({ name: found.name, company: found.company, phone: found.phone, email: found.email, document: found.document, address: found.address ?? "" });
      })
      .catch(() => active && setError("Não foi possível abrir o cadastro."));
    return () => { active = false; };
  }, [customerRef]);
  async function save() {
    if (!form) return;
    setSaving(true); setError(null);
    const response = await fetch("/api/backoffice/orcamento-editor/clientes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ref: customerRef, ...form }) });
    const data = await response.json().catch(() => ({})) as { customer?: Customer; message?: string };
    setSaving(false);
    if (response.ok && data.customer) return onSaved(data.customer);
    setError(data.message ?? "Não foi possível salvar.");
  }
  if (!form) return <p className={error ? "qe-error" : "qe-fhint"}>{error ?? "Carregando cadastro…"}</p>;
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  return (
    <div className="qe-newclient">
      <div className="qe-grid-3">
        <label className="qe-field"><span>Nome</span><input autoFocus onChange={set("name")} value={form.name} /></label>
        <label className="qe-field"><span>Empresa (opcional)</span><input onChange={set("company")} value={form.company} /></label>
        <label className="qe-field"><span>WhatsApp</span><input inputMode="tel" onChange={set("phone")} value={form.phone} /></label>
        <label className="qe-field"><span>E-mail{account ? " (login do site)" : " (opcional)"}</span><input disabled={account} inputMode="email" onChange={set("email")} value={form.email} /></label>
        <label className="qe-field"><span>CPF/CNPJ (opcional)</span><input onChange={set("document")} value={form.document} /></label>
        <label className="qe-field qe-address"><span>Endereço de entrega (opcional)</span><input onChange={set("address")} placeholder="Rua, número, bairro, cidade" value={form.address} /></label>
      </div>
      <p className="qe-fhint">Orçamentos e pedidos em aberto deste cliente passam a mostrar os dados novos.</p>
      {error ? <p className="qe-error">{error}</p> : null}
      <div className="qe-actions">
        <button className="qe-btn qe-btn-secondary" onClick={onCancel} type="button">Cancelar</button>
        <button className="qe-btn qe-btn-primary" disabled={saving} onClick={save} type="button">{saving ? "Salvando…" : "Salvar cliente"}</button>
      </div>
    </div>
  );
}

